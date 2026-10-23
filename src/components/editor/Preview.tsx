import { useCallback, useEffect, useRef, useState } from "react";
import { TransformOverlay } from "./TransformOverlay";
import { CropOverlay } from "./CropOverlay";
import {
  Diamond,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type EditorState, type EditorStore, useEditor } from "@/lib/editor/store";
import { renderFrame } from "@/lib/editor/render";
import { signedUrl } from "@/lib/editor/media";
import { clipGainAt, voiceClips } from "@/lib/editor/audio-fx";
import { outgoingTail } from "@/lib/editor/transitions";
import {
  FULL_QUALITY,
  SEEK_HOLD_MS,
  createPerfState,
  createSyncGate,
  levelScale,
  observePerfFrame,
  previewPaintAction,
  resetPerfWindow,
  resyncMedia,
  type SyncGate,
} from "@/lib/editor/perf";
import {
  type CaptionTrack,
  type MediaAsset,
  type Timeline,
  clipEnd,
  formatTime,
  isVisualClip,
  lastFrameTime,
  speedAt,
  sourceTime,
  timelineDuration,
} from "@/lib/editor/types";

interface Props {
  store: EditorStore;
  assets: Map<string, MediaAsset>;
  captions: CaptionTrack[];
  width: number;
  height: number;
  fps: number;
}

export function Preview({ store, assets, captions, width, height, fps }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const media = useRef(new Map<string, HTMLMediaElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  // clip id -> when its element was last repositioned: until the seek lands the element is still
  // presenting a frame from somewhere else, so a paint right now is not the frame being asked for
  const seekHeld = useRef(new Map<string, number>());
  // the last frame that was painted with every source present. Changing the canvas size wipes the
  // bitmap, and a stop changes it (full quality) while also starting a seek, so without something
  // outside the canvas to fall back on the player would show a black stage for that whole window.
  const freezeRef = useRef<HTMLCanvasElement | null>(null);
  const captionsRef = useRef(captions);
  captionsRef.current = captions;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const timeline = useEditor(store, (s) => s.timeline);
  const playing = useEditor(store, (s) => s.playing);
  const animate = useEditor(store, (s) => s.animate);
  const inspectorTab = useEditor(store, (s) => s.inspectorTab);
  const selectedClipId = useEditor(store, (s) => s.selectedClipId);
  const selectedClipKind = (() => {
    if (!selectedClipId) return null;
    for (const tr of timeline.tracks) {
      const c = tr.clips.find((x) => x.id === selectedClipId);
      if (c) return c.kind;
    }
    return null;
  })();
  const cropMode =
    inspectorTab === "crop" && (selectedClipKind === "video" || selectedClipKind === "image");
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(
        !!document.fullscreenElement && document.fullscreenElement === rootRef.current,
      );
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };
  const attachCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    setCanvasEl(el);
  }, []);
  const duration = timelineDuration(timeline);
  /** where a stopped playhead belongs: the last frame that paints a scene, not the empty one after it */
  const rest = lastFrameTime(timeline, fps);

  // preview resolution: the governor trades pixels for frame rate while playing and gives them
  // straight back the moment the timeline stops, so a scrubbed or paused frame is always full size
  const [learnedLevel, setLearnedLevel] = useState(FULL_QUALITY);
  const learnedRef = useRef(FULL_QUALITY);
  const perf = useRef(createPerfState());
  // one resync gate per clip: it is what keeps a start-up lag from being read as drift
  const syncGates = useRef(new Map<string, SyncGate>());
  const scale = levelScale(playing ? learnedLevel : FULL_QUALITY, width, height);
  const pw = Math.round(width * scale);
  const ph = Math.round(height * scale);

  // reconcile media elements with clips
  useEffect(() => {
    const live = new Set<string>();
    for (const tr of timeline.tracks) {
      for (const c of tr.clips) {
        if (!c.assetId) continue;
        const a = assets.get(c.assetId);
        if (!a) continue;
        if (c.kind === "video" || c.kind === "audio") {
          live.add(c.id);
          if (!media.current.has(c.id)) {
            const el = document.createElement(c.kind === "video" ? "video" : "audio");
            el.crossOrigin = "anonymous";
            el.preload = "auto";
            (el as HTMLVideoElement).playsInline = true;
            (el as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = false;
            el.dataset["asset"] = a.id;
            el.style.display = "none";
            // the hold has to end with the seek, not with a timeout, or every stop would wait out
            // the whole budget before showing the frame
            const dropHold = () => seekHeld.current.delete(c.id);
            el.addEventListener("seeked", dropHold);
            el.addEventListener("loadeddata", dropHold);
            holderRef.current?.appendChild(el);
            media.current.set(c.id, el);
            signedUrl(a.storage_path).then((u) => (el.src = u));
          } else {
            const el = media.current.get(c.id);
            if (!el) continue;
            if (el.dataset["asset"] !== a.id) {
              el.dataset["asset"] = a.id;
              signedUrl(a.storage_path).then((u) => (el.src = u));
            }
          }
        } else if (c.kind === "image" && !images.current.has(a.id)) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          images.current.set(a.id, img);
          signedUrl(a.storage_path).then((u) => (img.src = u));
        }
      }
    }
    for (const [id, el] of media.current) {
      if (!live.has(id)) {
        el.pause();
        el.removeAttribute("src");
        el.remove();
        media.current.delete(id);
        syncGates.current.delete(id);
        seekHeld.current.delete(id);
      }
    }
  }, [timeline, assets]);

  // render + sync loop
  useEffect(() => {
    let raf = 0;
    let clockStart = 0;
    let timeStart = 0;
    let wasPlaying = false;
    const ctx = canvasRef.current?.getContext("2d");
    const stage = canvasRef.current;
    if (!ctx || !stage) return;
    // Only re-render when something can have changed: playing, a seek, an edit, or a
    // source that still isn't decodable. Idle frames used to redraw the whole composite
    // at display refresh rate, which starved the video and the UI.
    const minFrameMs = 1000 / Math.max(1, fps) - 2;
    let lastT = Number.NaN;
    let lastTimeline: Timeline | undefined;
    let lastCaptions: CaptionTrack[] | null = null;
    let lastAssets: Map<string, MediaAsset> | null = null;
    let lastRenderAt = -1e9;
    let lastPlaying = false;
    let durCache = 0;
    let durFor: Timeline | undefined;
    // what the canvas is actually showing right now. The loop used to assume a paint was the frame
    // it was asked for, but a paint can happen while a video is mid-seek, and that is the empty
    // black stage a stopped player kept showing: these three make an unfinished repaint visible.
    let shownTimeline: Timeline | null = null;
    let shownTime = Number.NaN;
    let shownComplete = false;
    // every repositioned source is a picture the canvas has not shown yet, so a painted frame is
    // only up to date while nothing has moved underneath it
    let layoutRev = 0;
    let paintedRev = 0;
    let waitTimeline: Timeline | null = null;
    let waitTime = Number.NaN;
    let waitStart = 0;
    // The loop starts fresh whenever the canvas is resized, and a resize wipes the bitmap: nothing
    // on screen is usable until a frame is drawn, whether or not the trackers above were reset.
    let canvasBlank = true;

    /** Keep a copy of a frame that was painted whole, for the stage to fall back on. */
    const captureFreeze = (from: HTMLCanvasElement) => {
      const f = (freezeRef.current ??= document.createElement("canvas"));
      const fctx = f.getContext("2d");
      if (!fctx) return;
      if (f.width !== from.width) f.width = from.width;
      if (f.height !== from.height) f.height = from.height;
      fctx.clearRect(0, 0, f.width, f.height);
      fctx.drawImage(from, 0, 0);
    };

    /** Put that copy back, scaled to the canvas as it is now (the snapshot may be a lower level). */
    const restoreFreeze = (to: CanvasRenderingContext2D) => {
      const f = freezeRef.current;
      if (!f || !f.width || !f.height) return;
      to.setTransform(1, 0, 0, 1, 0, 0);
      to.globalAlpha = 1;
      to.globalCompositeOperation = "source-over";
      to.filter = "none";
      to.fillStyle = "#000";
      to.fillRect(0, 0, pw, ph);
      to.drawImage(f, 0, 0, pw, ph);
    };

    const durationOf = (tl: Timeline) => {
      if (durFor !== tl) {
        durFor = tl;
        durCache = timelineDuration(tl);
      }
      return durCache;
    };

    /**
     * Sources that are still buffering/loading must be retried on the next pass - and a video that
     * is seeking, or was only just repositioned, has a buffer but no picture for this time yet, so
     * it is not ready either. The outgoing tail of a transition paints the previous clip past its
     * own end, so that frame has to be decoded too.
     */
    const sourcesReady = (tl: Timeline, t: number, now: number) => {
      for (const tr of tl.tracks) {
        // only the clip kind matters: a media clip decodes wherever it sits in the timeline
        if (tr.hidden) continue;
        for (const c of tr.clips) {
          if (c.kind === "text" || c.kind === "shape" || c.kind === "audio" || c.kind === "effect" || c.kind === "filter")
            continue;
          const end = clipEnd(c);
          const inTail = t >= end && t < end + outgoingTail(tr, c);
          if (!(t >= c.start && t < end) && !inTail) continue;
          if (c.kind === "video") {
            const el = media.current.get(c.id) as HTMLVideoElement | undefined;
            if (!el || el.readyState < 2 || !el.src || el.seeking || el.videoWidth === 0) return false;
            const repositioned = seekHeld.current.get(c.id);
            if (repositioned !== undefined && now - repositioned < SEEK_HOLD_MS) return false;
          } else {
            const img = images.current.get(c.assetId ?? "");
            if (!img || !img.complete || !img.naturalWidth) return false;
          }
        }
      }
      return true;
    };

    const syncMedia = (s: EditorState, t: number, playingNow: boolean, now: number) => {
      // A position change is a seek in flight even when the browser reports the element as ready,
      // so it is recorded here rather than guessed at from `seeking` on the next read.
      const place = (id: string, el: HTMLMediaElement, target: number) => {
        if (Math.abs(el.currentTime - target) <= 0.001) return;
        el.currentTime = target;
        seekHeld.current.set(id, now);
        layoutRev++;
      };
      for (const tr of s.timeline.tracks) {
        for (const c of tr.clips) {
          const el = media.current.get(c.id);
          if (!el) continue;
          let gate = syncGates.current.get(c.id);
          if (!gate) {
            gate = createSyncGate();
            syncGates.current.set(c.id, gate);
          }
          const end = clipEnd(c);
          // the tail is a transition concern, so it follows the clip's own kind - a block or
          // an audio clip sharing a lane has nothing to hold open
          const tail = isVisualClip(c) ? outgoingTail(tr, c) : 0;
          const inClip = t >= c.start && t < end;
          const inTail = !inClip && t >= end && t < end + tail;
          if (!inClip && !inTail) {
            if (!el.paused) el.pause();
            // an element that is off screen is not in step with anything, so its next entrance gets
            // the same untouched start-up window as a fresh press of play
            gate.wasPlaying = false;
            gate.positioned = false;
            continue;
          }
          let target = sourceTime(c, t);
          if (isFinite(el.duration) && el.duration > 0)
            target = Math.min(el.duration - 0.05, target);
          const rate = Math.min(
            16,
            Math.max(0.0625, speedAt(c, Math.min(t - c.start, end - c.start))),
          );
          el.muted = tr.muted || inTail;
          const voices = c.duck && c.duck > 0 ? voiceClips(s.timeline, c.id) : null;
          el.volume = inTail ? 0 : Math.min(1, clipGainAt(c, t, voices));
          // Drift under the seek band is healed by nudging the rate instead of seeking: a seek
          // restarts the audio stream, which is the click/dropped-word the old resync produced every
          // time a heavy preview frame pushed the element a quarter second out of step. The gate keeps
          // the start-up lag (decode, buffer fill, governor settling) out of that decision, so pressing
          // play never speeds the voice up - the rate stays exactly the clip's own speed.
          const running = playingNow && c.freezeAt === undefined;
          // The first frame of an entrance is placement, not correction: a clip that starts mid
          // playback has to jump to its own source position right away. Re-arming the gate here is
          // what keeps that jump from being followed by a catch-up speed change.
          if (!gate.positioned) {
            gate.positioned = true;
            gate.startedAt = now;
            gate.since = Number.NEGATIVE_INFINITY;
            gate.wasPlaying = running;
            el.playbackRate = rate;
            place(c.id, el, target);
          }
          const sync = resyncMedia({
            now,
            playing: running,
            seeking: el.seeking,
            drift: el.currentTime - target,
            rate,
            gate,
          });
          if (Math.abs(el.playbackRate - sync.rate) > 0.005) el.playbackRate = sync.rate;
          if (sync.seek) place(c.id, el, target);
          if (running) {
            // never stack seeks: a pending seek that is ignored makes playback stutter
            if (el.paused) el.play().catch(() => {});
          } else if (!el.paused) el.pause();
        }
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const s = store.get();
      const dur = durationOf(s.timeline);
      let t = s.time;
      if (s.playing) {
        if (!wasPlaying) {
          clockStart = now;
          timeStart = t >= dur ? 0 : t;
          // a fresh start measures decode warm-up, not the steady cost of the scene
          resetPerfWindow(perf.current);
        }
        t = timeStart + (now - clockStart) / 1000;
        if (t >= dur) {
          // Finish on the last frame that actually exists. The timeline's own duration is one frame
          // past the final picture, and stopping there painted an empty black stage.
          t = lastFrameTime(s.timeline, fps);
          store.set({ time: t, playing: false });
        } else store.set({ time: t });
      }
      wasPlaying = s.playing && t < dur;

      const moved = t !== lastT;
      // Pausing keeps `time` unchanged, so an edge check on `playing` is what actually delivers
      // the pause to the media elements; without it the sound kept running under a stopped frame.
      const playingEdge = s.playing !== lastPlaying;
      lastPlaying = s.playing;
      if (moved || wasPlaying || playingEdge) syncMedia(s, t, wasPlaying, now);

      const restructured =
        s.timeline !== lastTimeline ||
        captionsRef.current !== lastCaptions ||
        assetsRef.current !== lastAssets;
      lastT = t;
      if (document.hidden) return;
      // Idle frames are only drawn again when the canvas is not already showing this one. Whether
      // the sources are ready is no longer the whole question: a frame painted while a video was
      // seeking is not the frame that was asked for, so it counts as unfinished and gets painted
      // again the moment the seek lands - which is what keeps a paused player on the scene it
      // stopped on instead of the empty stage the mid-seek paint produced.
      const ready = sourcesReady(s.timeline, t, now);
      let waitingMs = 0;
      if (ready) waitTimeline = null;
      else if (waitTimeline !== s.timeline || t !== waitTime) {
        // each position gets its own budget instead of inheriting an older frame's wait
        waitTimeline = s.timeline;
        waitTime = t;
        waitStart = now;
      } else waitingMs = now - waitStart;
      const action = previewPaintAction({
        stale:
          shownTimeline !== s.timeline ||
          t !== shownTime ||
          paintedRev !== layoutRev ||
          restructured ||
          playingEdge,
        complete: shownComplete,
        playing: wasPlaying,
        ready,
        waitingMs,
        blank: canvasBlank,
        frozen: !!freezeRef.current,
      });
      if (action === "hold") {
        // the stage is empty (the resize that came with this stop wiped it) and the picture for this
        // time is still decoding: show the last whole frame rather than the black canvas under it
        restoreFreeze(ctx);
        canvasBlank = false;
        return;
      }
      if (action !== "paint") return;
      if (now - lastRenderAt < minFrameMs && !restructured && !playingEdge) return;
      lastRenderAt = now;
      lastTimeline = s.timeline;
      lastCaptions = captionsRef.current;
      lastAssets = assetsRef.current;
      shownTimeline = s.timeline;
      shownTime = t;
      shownComplete = ready;
      paintedRev = layoutRev;
      canvasBlank = false;

      const renderStart = performance.now();
      let painted = true;
      try {
        renderFrame(
          ctx,
          s.timeline,
          t,
          (c) => {
            if (c.kind === "video") {
              const v = media.current.get(c.id) as HTMLVideoElement | undefined;
              return v && v.readyState >= 2 ? v : null;
            }
            if (c.kind === "image") {
              const img = images.current.get(c.assetId ?? "");
              return img && img.complete && img.naturalWidth ? img : null;
            }
            return null;
          },
          { width: pw, height: ph, baseHeight: height, captions: captionsRef.current },
        );
      } catch (e) {
        painted = false;
        // A frame that threw part-way is a black stage with maybe some of the picture on it, and the
        // canvas is now marked as showing this frame, so nothing would ever draw over it. Put the
        // snapshot back and count the attempt as made: a source that throws will throw every time,
        // and retrying it each frame would starve the loop.
        restoreFreeze(ctx);
        console.error("[preview] frame paint failed", e);
      }
      // Only a frame that is whole is worth holding as a fallback; a partial one is the black stage
      // this is meant to prevent.
      if (ready && painted) captureFreeze(stage);
      // Only playback frames steer the governor: a paused frame is allowed to be slow because it
      // is drawn once, at full quality, and there is no stream to keep up with.
      if (wasPlaying) {
        const level = observePerfFrame(
          perf.current,
          now,
          performance.now() - renderStart,
          1000 / Math.max(1, fps),
        );
        if (level !== learnedRef.current) {
          learnedRef.current = level;
          setLearnedLevel(level);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, pw, ph, height, fps]);

  useEffect(
    () => () => {
      for (const el of media.current.values()) el.pause();
    },
    [],
  );

  const frame = 1 / fps;
  return (
    <div ref={rootRef} className={`flex h-full min-h-0 flex-col${isFullscreen ? " bg-black" : ""}`}>
      <div ref={holderRef} className="hidden" />
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-stage p-10">
        <canvas
          data-preview
          ref={attachCanvas}
          width={pw}
          height={ph}
          className="max-h-full max-w-full shadow-2xl"
          style={{ aspectRatio: `${width}/${height}` }}
        />
        {!cropMode && (
          <TransformOverlay
            store={store}
            assets={assets}
            canvas={canvasEl}
            width={width}
            height={height}
          />
        )}
        <CropOverlay
          store={store}
          assets={assets}
          canvas={canvasEl}
          width={width}
          height={height}
        />
      </div>
      <div className="flex items-center justify-center gap-1 border-t bg-panel px-3 py-2">
        <TimeReadout store={store} fps={fps} />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => store.set({ time: 0 })}
          aria-label="Go to start"
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => store.set({ time: Math.max(0, store.get().time - frame), playing: false })}
          aria-label="Previous frame"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          onClick={() => {
            const s = store.get();
            store.set({ playing: !s.playing, time: !s.playing && s.time >= rest ? 0 : s.time });
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() =>
            store.set({ time: Math.min(rest, store.get().time + frame), playing: false })
          }
          aria-label="Next frame"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => store.set({ time: rest })}
          aria-label="Go to end"
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit full screen" : "Play in full screen"}
          title={isFullscreen ? "Exit full screen" : "Play in full screen"}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {formatTime(duration, fps)}
        </span>
        <Button
          size="sm"
          variant={animate ? "destructive" : "ghost"}
          className="ml-2"
          onClick={() => store.set({ animate: !animate })}
          title="When on, moving, resizing or rotating on the canvas adds keyframes at the playhead"
        >
          <Diamond className="mr-1 h-3.5 w-3.5" /> {animate ? "Recording keyframes" : "Animate"}
        </Button>
      </div>
    </div>
  );
}

/** Leaf readout: the time code ticks each frame without re-rendering the whole preview. */
function TimeReadout({ store, fps }: { store: EditorStore; fps: number }) {
  const time = useEditor(store, (s) => s.time);
  return <span className="mr-auto font-mono text-xs text-primary">{formatTime(time, fps)}</span>;
}
