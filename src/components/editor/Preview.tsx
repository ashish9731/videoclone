import { useCallback, useEffect, useRef, useState } from "react";
import { TransformOverlay } from "./TransformOverlay";
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
import { type EditorStore, useEditor } from "@/lib/editor/store";
import { renderFrame } from "@/lib/editor/render";
import { signedUrl } from "@/lib/editor/media";
import { clipGainAt, voiceClips } from "@/lib/editor/audio-fx";
import { outgoingTail } from "@/lib/editor/transitions";
import {
  type CaptionTrack,
  type MediaAsset,
  clipEnd,
  formatTime,
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
  const captionsRef = useRef(captions);
  captionsRef.current = captions;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const timeline = useEditor(store, (s) => s.timeline);
  const playing = useEditor(store, (s) => s.playing);
  const time = useEditor(store, (s) => s.time);
  const animate = useEditor(store, (s) => s.animate);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === rootRef.current);
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

  // preview resolution: cap long side at 1280
  const scale = Math.min(1, 1280 / Math.max(width, height));
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
            el.dataset['asset'] = a.id;
            el.style.display = "none";
            holderRef.current?.appendChild(el);
            media.current.set(c.id, el);
            signedUrl(a.storage_path).then((u) => (el.src = u));
          } else {
            const el = media.current.get(c.id);
            if (!el) continue;
            if (el.dataset['asset'] !== a.id) {
              el.dataset['asset'] = a.id;
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
    if (!ctx) return;
    const tick = () => {
      const s = store.get();
      let t = s.time;
      const dur = timelineDuration(s.timeline);
      if (s.playing) {
        if (!wasPlaying) {
          clockStart = performance.now();
          timeStart = t >= dur ? 0 : t;
        }
        t = timeStart + (performance.now() - clockStart) / 1000;
        if (t >= dur) {
          t = dur;
          store.set({ time: t, playing: false });
        } else store.set({ time: t });
      }
      wasPlaying = s.playing && t < dur;

      for (const tr of s.timeline.tracks) {
        for (const c of tr.clips) {
          const el = media.current.get(c.id);
          if (!el) continue;
          const end = clipEnd(c);
          const tail = tr.kind === "audio" ? 0 : outgoingTail(tr, c);
          const inClip = t >= c.start && t < end;
          const inTail = !inClip && t >= end && t < end + tail;
          if (!inClip && !inTail) {
            if (!el.paused) el.pause();
            continue;
          }
          let target = sourceTime(c, t);
          if (isFinite(el.duration) && el.duration > 0) target = Math.min(el.duration - 0.05, target);
          const rate = Math.min(16, Math.max(0.0625, speedAt(c, Math.min(t - c.start, end - c.start))));
          if (Math.abs(el.playbackRate - rate) > 0.01) el.playbackRate = rate;
          el.muted = tr.muted || inTail;
          const voices = c.duck && c.duck > 0 ? voiceClips(s.timeline, c.id) : null;
          el.volume = inTail ? 0 : Math.min(1, clipGainAt(c, t, voices));
          if (wasPlaying && c.freezeAt === undefined) {
            if (Math.abs(el.currentTime - target) > 0.25 * Math.max(1, rate)) el.currentTime = target;
            if (el.paused) el.play().catch(() => {});
          } else {
            if (!el.paused) el.pause();
            if (Math.abs(el.currentTime - target) > 0.02 && !el.seeking) el.currentTime = target;
          }
        }
      }

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
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, pw, ph, height]);

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
        <canvas data-preview
          ref={attachCanvas}
          width={pw}
          height={ph}
          className="max-h-full max-w-full shadow-2xl"
          style={{ aspectRatio: `${width}/${height}` }}
        />
        <TransformOverlay store={store} assets={assets} canvas={canvasEl} width={width} height={height} />
      </div>
      <div className="flex items-center justify-center gap-1 border-t bg-panel px-3 py-2">
        <span className="mr-auto font-mono text-xs text-primary">{formatTime(time, fps)}</span>
        <Button size="icon" variant="ghost" onClick={() => store.set({ time: 0 })} aria-label="Go to start">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => store.set({ time: Math.max(0, time - frame), playing: false })} aria-label="Previous frame">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          onClick={() => store.set({ playing: !playing, time: !playing && time >= duration ? 0 : time })}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => store.set({ time: Math.min(duration, time + frame), playing: false })} aria-label="Next frame">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => store.set({ time: duration })} aria-label="Go to end">
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
        <span className="ml-auto font-mono text-xs text-muted-foreground">{formatTime(duration, fps)}</span>
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
