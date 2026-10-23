import { Fragment, type CSSProperties, useEffect, useRef, useState } from "react";
import { AudioClipVolume } from './AudioClipVolume';
import {
  Captions,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Magnet,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  Snowflake,
  Crop,
  PanelLeftClose,
  PanelRightClose,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type EditorStore, useEditor } from "@/lib/editor/store";
import {
  type CaptionCue,
  type CaptionTrack,
  type Clip,
  type MediaAsset,
  type Track,
  type TrackKind,
  clipDuration,
  clipEnd,
  clampPlayhead,
  clipFromAsset,
  isVisualClip,
  lastFrameTime,
  newTrack,
  splitClip,
  textClip,
  timelineDuration,
  uid,
} from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { editCue } from "@/lib/editor/caption-edit";
import { maxTransitionDuration, prevAdjacent, transitionBlockSpan, transitionName } from "@/lib/editor/transitions";
import { accepts, addClipToTimeline, removeTransition, seamTargetAt, selectTransition } from "@/lib/editor/placement";
import { ASSET_MIME, activeDragPreset, applyPresetAt, hasAssetPayload, parsePresetPayload } from "./library-drag";
import { insertFreeze, trimAtPlayhead } from '@/lib/editor/edit-actions';

const HEADER_W = 168;
const RULER_H = 26;
const rowH = (k: TrackKind) => (k === "video" ? 60 : k === "audio" ? 48 : k === "effect" ? 40 : k === "filter" ? 40 : 40);
/**
 * Height of the band a lane keeps under its clip rectangles for transitions. A blend is an item of
 * its own, so it never shares a rectangle with a clip and never shortens one when it is resized.
 */
const STRIP_H = 22;
/** A very short blend still needs a few pixels to be clickable. */
const MIN_TRANS_W = 20;

const clipColor: Record<Clip["kind"], string> = {
  video: "bg-clip-video",
  image: "bg-clip-image",
  audio: "bg-clip-audio",
  text: "bg-clip-text",
  shape: "bg-clip-image",
  effect: "bg-clip-effect",
  filter: "bg-clip-filter",
};

/**
 * Only a lane holding clips that paint a frame layer can hold a join between them, so only that
 * lane grows a transition band. Pure audio and effect-block lanes keep their own height.
 */
function hasTransitionStrip(tr: Track): boolean {
  return tr.clips.some(isVisualClip);
}

interface Props {
  store: EditorStore;
  assets: Map<string, MediaAsset>;
  /** project frame size, needed to author a text template dropped from the library */
  width?: number;
  height?: number;
  /** project frame rate: it decides which moment is the last frame a stopped playhead can sit on */
  fps?: number;
  /** caption cues get a line of their own under the tracks, so they never sit over a video */
  captions?: CaptionTrack[];
  /** retimed on the lane: the route owns caption persistence */
  onUpdateCaption?: ((id: string, fn: (t: CaptionTrack) => CaptionTrack) => void) | undefined;
  /** asking the library to show this track's cue list */
  onActiveCaption?: ((id: string) => void) | undefined;
}

export function Timeline({
  store,
  assets,
  width = 1920,
  height = 1080,
  fps = 30,
  captions = [],
  onUpdateCaption,
  onActiveCaption,
}: Props) {
  const timeline = useEditor(store, (s) => s.timeline);
  const selected = useEditor(store, (s) => s.selectedClipId);
  const selectedTransitionOf = useEditor(store, (s) => s.selectedTransitionOf);
  const pps = useEditor(store, (s) => s.pxPerSec);
  const snapping = useEditor(store, (s) => s.snapping);
  const canUndo = useEditor(store, (s) => s.canUndo);
  const canRedo = useEditor(store, (s) => s.canRedo);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** the seam a dragged transition is about to land on, so the drop is aimed, not guessed */
  const [seamHover, setSeamHover] = useState<string | null>(null);

  const duration = timelineDuration(timeline);
  const contentW = Math.max(1200, (duration + 30) * pps);

  const timeAtClientX = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left - HEADER_W + el.scrollLeft) / pps);
  };

  /**
   * A seek always lands on a frame that paints a scene. The lane is drawn wider than the timeline,
   * so the raw pointer time can be past the end, where nothing is active and the preview is black.
   */
  const seekAtClientX = (clientX: number) =>
    clampPlayhead(timeAtClientX(clientX), store.get().timeline, fps);

  const seekDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    store.set({ playing: false, time: seekAtClientX(e.clientX) });
    const move = (ev: PointerEvent) => store.set({ time: seekAtClientX(ev.clientX) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const snapPoints = (excludeId: string) => {
    const pts: number[] = [0, store.get().time];
    for (const tr of store.get().timeline.tracks)
      for (const c of tr.clips) if (c.id !== excludeId) pts.push(c.start, clipEnd(c));
    return pts;
  };

  const startClipDrag = (e: React.PointerEvent, clip: Clip, track: Track, mode: "move" | "l" | "r") => {
    e.stopPropagation();
    e.preventDefault();
    store.set({ selectedClipId: clip.id });
    if (track.locked) return;
    store.beginGesture();
    const startX = e.clientX;
    const orig = clip;
    const pts = snapPoints(clip.id);
    const d = clipDuration(orig);
    // average source seconds per timeline second (accounts for speed ramps)
    const rate = d > 0 ? (orig.out - orig.in) / d : orig.speed;
    const snap = (v: number) => {
      if (!store.get().snapping) return v;
      const thr = 8 / store.get().pxPerSec;
      for (const p of pts) if (Math.abs(v - p) < thr) return p;
      return null;
    };
    let curTrackId = track.id;

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / store.get().pxPerSec;
      if (mode === "move") {
        let ns = Math.max(0, orig.start + dx);
        const s1 = snap(ns);
        if (s1 !== null && s1 !== ns) ns = s1;
        else {
          const s2 = snap(ns + d);
          if (s2 !== null && s2 !== ns + d) ns = Math.max(0, s2 - d);
        }
        const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-track-id]") as HTMLElement | null;
        const target = hit?.dataset['trackId'];
        const tgtTrack = store.get().timeline.tracks.find((t) => t.id === target);
        if (tgtTrack && !tgtTrack.locked && accepts(tgtTrack.kind, orig.kind)) curTrackId = tgtTrack.id;
        store.update((t) => {
          const moved = { ...orig, start: ns };
          return {
            tracks: t.tracks.map((tr) => {
              const rest = tr.clips.filter((c) => c.id !== orig.id);
              return tr.id === curTrackId ? { ...tr, clips: [...rest, moved] } : { ...tr, clips: rest };
            }),
          };
        });
      } else if (mode === "l") {
        let newStart = orig.start + dx;
        const s = snap(newStart);
        if (s !== null) newStart = s;
        let newIn = orig.in + (newStart - orig.start) * rate;
        newIn = Math.max(0, Math.min(newIn, orig.out - 0.1 * rate));
        newStart = orig.start + (newIn - orig.in) / rate;
        if (newStart < 0) {
          newIn -= newStart * rate;
          newStart = 0;
        }
        store.updateClip(orig.id, (c) => ({ ...c, in: newIn, start: newStart }));
      } else {
        let newEnd = orig.start + d + dx;
        const s = snap(newEnd);
        if (s !== null) newEnd = s;
        let newOut = orig.in + (newEnd - orig.start) * rate;
        newOut = Math.min(orig.sourceDuration, Math.max(orig.in + 0.1 * rate, newOut));
        store.updateClip(orig.id, (c) => ({ ...c, out: newOut }));
      }
    };
    const up = () => {
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDrop = (e: React.DragEvent) => {
    if (!hasAssetPayload(e)) return;
    e.preventDefault();
    setSeamHover(null);
    const id = e.dataTransfer.getData(ASSET_MIME) || e.dataTransfer.getData("text/plain");
    // Free placement: the drop X is the clip start (snapped when enabled); the
    // lane under the cursor is only a preference, otherwise the first
    // compatible track receives the clip.
    let time = timeAtClientX(e.clientX);
    if (store.get().snapping) {
      const thr = 8 / store.get().pxPerSec;
      for (const p of snapPoints("")) if (Math.abs(time - p) < thr) time = Math.max(0, p);
    }
    const lane = (e.target as HTMLElement).closest?.("[data-track-id]") as HTMLElement | null;
    const trackId = lane?.dataset["trackId"];
    // a library tile carries `preset:<tab>:<id>`: an effect block, a seam transition, a grade,
    // a text or sticker overlay - each lands on the lane and at the moment it was dropped on
    const preset = parsePresetPayload(id);
    if (preset) {
      applyPresetAt(store, preset.tab, preset.id, { time, trackId, pxPerSec: store.get().pxPerSec, width, height });
      return;
    }
    const a = assets.get(id);
    if (!a) return;
    addClipToTimeline(store, clipFromAsset(a, time), trackId);
  };

  /**
   * A transition only fits a joint between two touching clips, and `dataTransfer` is unreadable
   * while dragging, so the tile that left the library is remembered and its future seam is
   * resolved with the same call the drop uses - the highlight cannot disagree with the placement.
   */
  const previewSeam = (e: React.DragEvent) => {
    if (activeDragPreset()?.tab !== "Transitions") return;
    const lane = (e.target as HTMLElement).closest?.("[data-track-id]") as HTMLElement | null;
    const seam = seamTargetAt(store.get().timeline.tracks, timeAtClientX(e.clientX), 8 / pps, lane?.dataset["trackId"]);
    const next = seam?.clip.id ?? null;
    setSeamHover((cur) => (cur === next ? cur : next));
  };

  const split = () => {
    const { selectedClipId, time } = store.get();
    const hit = store.findClip(selectedClipId);
    const spans = (c: Clip) => time > c.start && time < clipEnd(c);
    const targets = hit && spans(hit.clip)
      ? [hit.clip]
      : store.get().timeline.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.filter(spans));
    if (!targets.length) return;
    store.update((t) => ({
      tracks: t.tracks.map((tr) => ({
        ...tr,
        clips: tr.clips.flatMap((c) => {
          if (!targets.some((x) => x.id === c.id) || tr.locked) return [c];
          return splitClip(c, time) ?? [c];
        }),
      })),
    }));
  };

  const del = () => {
    const { selectedClipId, selectedTransitionOf } = store.get();
    if (!selectedClipId) return;
    // a selected transition is its own object: Del removes the blend, never the clip under it
    if (selectedTransitionOf === selectedClipId) removeTransition(store, selectedClipId);
    else {
      store.update((t) => ({ tracks: t.tracks.map((tr) => (tr.locked ? tr : { ...tr, clips: tr.clips.filter((c) => c.id !== selectedClipId) })) }));
      store.set({ selectedClipId: null });
    }
  };

  const trim = (side: 'left' | 'right') => {
    const hit = store.findClip(store.get().selectedClipId);
    if (!hit || hit.track.locked) return;
    const next = trimAtPlayhead(hit.clip, store.get().time, side);
    if (next) store.updateClip(hit.clip.id, () => next);
  };
  const freeze = () => {
    const hit = store.findClip(store.get().selectedClipId);
    if (!hit || hit.track.locked) return;
    const time = store.get().time;
    const parts = insertFreeze(hit.clip, time);
    if (!parts) return;
    store.updateTrack(hit.track.id, tr => ({ ...tr, clips: tr.clips.flatMap(c => c.id === hit.clip.id ? parts : c.start >= time ? [{ ...c, start: c.start + 3 }] : [c]) }));
    store.set({ selectedClipId: parts.find(c => c.freezeAt !== undefined)?.id ?? null });
  };

  const duplicate = () => {
    const hit = store.findClip(store.get().selectedClipId);
    if (!hit) return;
    const copy = { ...hit.clip, id: uid(), start: clipEnd(hit.clip) };
    store.updateTrack(hit.track.id, (tr) => ({ ...tr, clips: [...tr.clips, copy] }));
    store.set({ selectedClipId: copy.id });
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.closest('[role="slider"], [role="combobox"]') || (e.target as HTMLElement)?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        const s = store.get();
        store.set({ playing: !s.playing, time: !s.playing && s.time >= lastFrameTime(s.timeline, fps) ? 0 : s.time });
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (e.key === "s" || e.key === "S") split();
      else if (e.key === "Delete" || e.key === "Backspace") del();
      else if (e.key === "Escape") store.set({ selectedClipId: null });
      else if (e.key === "ArrowLeft") store.set({ time: clampPlayhead(store.get().time - (e.shiftKey ? 1 : 1 / fps), store.get().timeline, fps), playing: false });
      else if (e.key === "ArrowRight") store.set({ time: clampPlayhead(store.get().time + (e.shiftKey ? 1 : 1 / fps), store.get().timeline, fps), playing: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const addTrack = (kind: TrackKind) =>
    store.update((t) => {
      const n = t.tracks.filter((tr) => tr.kind === kind).length + 1;
      const tr = newTrack(kind, n);
      return { tracks: kind === "audio" ? [...t.tracks, tr] : [tr, ...t.tracks] };
    });

  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pps >= 70) ?? 300;
  const ticks: number[] = [];
  for (let s = 0; s * pps < contentW; s += step) ticks.push(s);

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button size="icon" variant="ghost" disabled={!canUndo} onClick={() => store.undo()} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" disabled={!canRedo} onClick={() => store.redo()} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={split} title="Split at playhead (S)">
          <Scissors className="mr-1 h-4 w-4" /> Split
        </Button>
        <Button size="icon" variant="ghost" onClick={duplicate} disabled={!selected} aria-label="Duplicate" title="Duplicate (Ctrl+D)">
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => trim('left')} disabled={!selected} aria-label="Trim left" title="Trim left to playhead"><PanelLeftClose className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => trim('right')} disabled={!selected} aria-label="Trim right" title="Trim right to playhead"><PanelRightClose className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={freeze} disabled={!selected || store.findClip(selected)?.clip.kind !== 'video'} aria-label="Freeze frame" title="Insert 3-second freeze frame"><Snowflake className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => store.set({ inspectorTab: 'crop' })} disabled={!selected} aria-label="Crop clip" title="Crop"><Crop className="size-4" /></Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={del}
          disabled={!selected}
          aria-label={selected && selectedTransitionOf === selected ? "Remove transition" : "Delete clip"}
          title={selected && selectedTransitionOf === selected ? "Remove this transition (Del)" : "Delete clip (Del)"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => addClipToTimeline(store, textClip(store.get().time))}>
          <Type className="mr-1 h-4 w-4" /> Text
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <Plus className="mr-1 h-4 w-4" /> Track
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => addTrack("video")}>Video track</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addTrack("audio")}>Audio track</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addTrack("text")}>Text track</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addTrack("effect")}>Effects track</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addTrack("filter")}>Filters track</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="icon"
          variant={snapping ? "secondary" : "ghost"}
          onClick={() => store.set({ snapping: !snapping })}
          aria-label="Toggle snapping"
          title="Snapping"
        >
          <Magnet className={cn("h-4 w-4", snapping && "text-primary")} />
        </Button>
        <div className="ml-auto flex w-48 items-center gap-2">
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
          <Slider min={8} max={400} step={1} value={[pps]} onValueChange={([v]) => store.set({ pxPerSec: v ?? 60 })} />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onDragOver={(e) => {
          if (hasAssetPayload(e)) {
            e.preventDefault();
            // Firefox cancels the drop without an explicit copy effect.
            e.dataTransfer.dropEffect = "copy";
            previewSeam(e);
          }
        }}
        onDragLeave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setSeamHover(null);
        }}
        onDrop={onDrop}
      >
        <div className="relative" style={{ width: HEADER_W + contentW }}>
          {/* ruler */}
          <div className="sticky top-0 z-30 flex" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-40 shrink-0 border-b border-r bg-panel" style={{ width: HEADER_W }} />
            <div className="relative flex-1 cursor-pointer border-b bg-card" onPointerDown={seekDrag}>
              {ticks.map((s) => (
                <div key={s} className="absolute top-0 h-full border-l border-border" style={{ left: s * pps }}>
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {Math.floor(s / 60)}:{String(Math.floor(s % 60)).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {timeline.tracks.map((tr) => {
            const strip = hasTransitionStrip(tr);
            return (
              <div key={tr.id} className="flex border-b" style={{ height: rowH(tr.kind) + (strip ? STRIP_H : 0) }}>
                <TrackHeader track={tr} store={store} />
                <div
                  data-track-id={tr.id}
                  className={cn("relative flex-1", tr.locked ? "bg-muted/40" : "bg-background/40")}
                  onPointerDown={(e) => {
                    store.set({ selectedClipId: null });
                    seekDrag(e);
                  }}
                >
                  {/* Every clip keeps its whole rectangle: a transition never eats into a clip, it
                      lives in the band below. */}
                  <div className="absolute inset-x-0 top-0" style={{ bottom: strip ? STRIP_H : 0 }}>
                    {tr.clips.map((c) => (
                      <ClipBlock
                        key={c.id}
                        clip={c}
                        pps={pps}
                        selected={c.id === selected}
                        dim={tr.hidden || tr.muted}
                        store={store}
                        locked={tr.locked}
                        onDown={(e, mode) => startClipDrag(e, c, tr, mode)}
                      />
                    ))}
                  </div>
                  {strip && (
                    <div
                      data-transition-strip={tr.id}
                      aria-label="Transitions"
                      className="absolute inset-x-0 bottom-0 border-t border-border/60 bg-muted/30"
                      style={{ height: STRIP_H }}
                    >
                      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 select-none text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Transitions
                      </span>
                      {tr.clips.map((c) => {
                        // A transition is an object of its own, drawn in the lane's own band under
                        // the clips and centred on the joint, so it hangs off neither video.
                        const span = transitionBlockSpan(c);
                        if (span) {
                          return (
                            <Fragment key={`t-${c.id}`}>
                              {/* the cut, ruled up through the clips so the block reads as the join */}
                              <span
                                aria-hidden
                                className="pointer-events-none absolute -top-6 bottom-0 z-10 w-px bg-primary/40"
                                style={{ left: span.center * pps }}
                              />
                              <TransitionBlock
                                clip={c}
                                prev={prevAdjacent(tr, c)}
                                pps={pps}
                                store={store}
                                track={tr}
                                hovering={seamHover === c.id}
                              />
                            </Fragment>
                          );
                        }
                        // seams blend frame layers, so they belong to any lane holding two touching
                        // visual clips - only audio clips and full-effect blocks are excluded
                        if (!isVisualClip(c)) return null;
                        if (!prevAdjacent(tr, c)) return null;
                        return (
                          <button
                            key={`j-${c.id}`}
                            className={cn(
                              "absolute top-1/2 z-20 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border text-[9px] font-bold",
                              seamHover === c.id
                                ? "border-primary bg-primary/30 text-primary"
                                : "border-border bg-card text-muted-foreground hover:text-foreground",
                            )}
                            style={{ left: c.start * pps }}
                            title="Add a transition between these clips"
                            aria-label="Add transition"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tr.locked) return;
                              store.updateClip(c.id, (cl) => ({
                                ...cl,
                                transitionIn: { type: "fade", duration: Math.min(0.8, maxTransitionDuration(prevAdjacent(tr, cl), cl)) },
                              }));
                              selectTransition(store, c.id);
                            }}
                          >
                            ⋈
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {/* Caption cues get lines of their own under the picture: a cue is never drawn inside a
              video row, it is a block on the track it belongs to. */}
          {captions.map((ct) => (
            <CaptionLane key={ct.id} track={ct} pps={pps} store={store} onUpdate={onUpdateCaption} onActive={onActiveCaption} />
          ))}
          <Playhead store={store} />
        </div>
      </div>
    </div>
  );
}

function Playhead({ store }: { store: EditorStore }) {
  const time = useEditor(store, (s) => s.time);
  const pps = useEditor(store, (s) => s.pxPerSec);
  return (
    <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-playhead" style={{ left: HEADER_W + time * pps }}>
      <div className="-ml-[5px] h-3 w-[11px] rounded-b-sm bg-playhead" />
    </div>
  );
}

function TrackHeader({ track, store }: { track: Track; store: EditorStore }) {
  const toggle = (k: "muted" | "hidden" | "locked") => store.updateTrack(track.id, (t) => ({ ...t, [k]: !t[k] }));
  return (
    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-r bg-panel px-2" style={{ width: HEADER_W }}>
      <span className="flex-1 truncate text-xs font-medium">{track.name}</span>
      {track.kind !== "text" && (
        <button className="rounded p-1 hover:bg-accent" onClick={() => toggle("muted")} aria-label="Mute track">
          {track.muted ? <VolumeX className="h-3.5 w-3.5 text-destructive" /> : <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      )}
      {track.kind !== "audio" && (
        <button className="rounded p-1 hover:bg-accent" onClick={() => toggle("hidden")} aria-label="Hide track">
          {track.hidden ? <EyeOff className="h-3.5 w-3.5 text-destructive" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      )}
      <button className="rounded p-1 hover:bg-accent" onClick={() => toggle("locked")} aria-label="Lock track">
        {track.locked ? <Lock className="h-3.5 w-3.5 text-primary" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      <button
        className="rounded p-1 hover:bg-accent"
        onClick={() => store.update((t) => ({ tracks: t.tracks.filter((x) => x.id !== track.id) }))}
        aria-label="Delete track"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

/** A caption cue is a short phrase, so its line stays thinner than a clip lane. */
const CAPTION_ROW_H = 34;

/**
 * A caption track as the line it is: every cue is a block of its own, under the picture instead of
 * painted over a video. Drag a block to move the phrase, trim either end to retime it, click it to
 * open it in the caption editor. The cues still live in the caption track, so this lane and the
 * panel are two views of one list and the renderer keeps drawing them the same way it always did.
 */
function CaptionLane({
  track,
  pps,
  store,
  onUpdate,
  onActive,
}: {
  track: CaptionTrack;
  pps: number;
  store: EditorStore;
  onUpdate?: ((id: string, fn: (t: CaptionTrack) => CaptionTrack) => void) | undefined;
  onActive?: ((id: string) => void) | undefined;
}) {
  // Only the cue under the playhead is subscribed: a lane holding hundreds of cues must not
  // re-render on every frame of playback.
  const currentCueId = useEditor(store, (s) => {
    for (const cue of track.cues) if (s.time >= cue.start && s.time < cue.end) return cue.id;
    return "";
  });

  const retime = (cue: CaptionCue, patch: Partial<CaptionCue>) => {
    if (!onUpdate) return;
    const next = editCue(cue, patch);
    onUpdate(track.id, (t) => ({ ...t, cues: t.cues.map((c) => (c.id === cue.id ? next : c)) }));
  };

  const startDrag = (e: React.PointerEvent, cue: CaptionCue, mode: "move" | "l" | "r") => {
    e.stopPropagation();
    e.preventDefault();
    onActive?.(track.id);
    // landing on the cue is what shows its text in the caption editor
    store.set({ selectedClipId: null, playing: false, time: mode === "r" ? cue.end : cue.start });
    if (!onUpdate) return;
    const startX = e.clientX;
    const orig = cue;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / store.get().pxPerSec;
      if (mode === "move") retime(orig, { start: orig.start + dx, end: orig.end + dx });
      else if (mode === "l") retime(orig, { start: orig.start + dx });
      else retime(orig, { end: orig.end + dx });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="flex border-b" style={{ height: CAPTION_ROW_H }}>
      <div className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-r bg-panel px-2" style={{ width: HEADER_W }}>
        <Captions className="size-3.5 shrink-0 text-primary" />
        <span className="flex-1 truncate text-xs font-medium">{track.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{track.cues.length}</span>
        {onUpdate && (
          <button
            className="rounded p-1 hover:bg-accent"
            aria-label={track.visible ? "Hide captions" : "Show captions"}
            title="Captions on a hidden line are neither previewed nor burned into the export"
            onClick={() => onUpdate(track.id, (t) => ({ ...t, visible: !t.visible }))}
          >
            {track.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        )}
      </div>
      <div
        data-caption-track={track.id}
        className={cn("relative flex-1", track.visible ? "bg-background/40" : "bg-muted/30")}
        onPointerDown={() => {
          store.set({ selectedClipId: null });
        }}
      >
        {track.cues.map((cue) => {
          const w = Math.max(6, (cue.end - cue.start) * pps);
          const on = cue.id === currentCueId;
          return (
            <div
              key={cue.id}
              data-caption-cue={cue.id}
              role="button"
              tabIndex={0}
              aria-label={`Caption "${cue.text}" ${cue.start.toFixed(2)} to ${cue.end.toFixed(2)} seconds`}
              title="Drag to move, trim either end, click to edit the text"
              className={cn(
                "absolute inset-y-[3px] flex cursor-grab select-none items-center overflow-hidden rounded-md border px-1.5 text-[10px] active:cursor-grabbing",
                on ? "border-primary bg-primary/25 text-primary" : "border-border bg-clip-text text-foreground/80",
                !track.visible && "opacity-40",
              )}
              style={{ left: cue.start * pps, width: w }}
              onPointerDown={(e) => startDrag(e, cue, "move")}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onActive?.(track.id);
                store.set({ playing: false, time: cue.start });
              }}
            >
              <span className="truncate">{cue.text || "—"}</span>
              <span
                data-caption-edge="l"
                aria-label="Trim caption start"
                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-foreground/0 hover:bg-foreground/40"
                onPointerDown={(e) => startDrag(e, cue, "l")}
              />
              <span
                data-caption-edge="r"
                aria-label="Trim caption end"
                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-foreground/0 hover:bg-foreground/40"
                onPointerDown={(e) => startDrag(e, cue, "r")}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClipBlock({
  clip,
  pps,
  selected,
  dim,
  onDown,
  store,
  locked,
}: {
  clip: Clip;
  pps: number;
  selected: boolean;
  dim: boolean;
  store: EditorStore;
  locked: boolean;
  onDown: (e: React.PointerEvent, mode: "move" | "l" | "r") => void;
}) {
  const d = clipDuration(clip);
  const w = Math.max(4, d * pps);
  const kfTimes = new Set<number>();
  Object.values(clip.keyframes).forEach((arr) => arr?.forEach((k) => kfTimes.add(Math.round(k.t * 100) / 100)));
  return (
    <div
      data-clip-id={clip.id}
      className={cn(
        "absolute bottom-1 top-1 cursor-grab overflow-hidden rounded-md text-[11px] text-foreground active:cursor-grabbing",
        clipColor[clip.kind],
        selected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "ring-1 ring-background/40",
        dim && "opacity-40",
      )}
      style={{ left: clip.start * pps, width: w }}
      onPointerDown={(e) => onDown(e, "move")}
    >
      <div className="flex h-full items-start gap-1 px-2 py-1">
        <span className="truncate font-medium drop-shadow">{clip.kind === "text" ? clip.text?.content : clip.name}</span>
        {clip.speedCurve ? (
          <span className="rounded bg-background/60 px-1 font-mono">curve</span>
        ) : (
          clip.speed !== 1 && <span className="rounded bg-background/60 px-1 font-mono">{clip.speed}x</span>
        )}
        {clip.kind !== 'effect' && clip.kind !== 'filter' && (clip.filter || clip.fx?.length) && <span className="rounded bg-background/60 px-1 font-mono">fx</span>}
      </div>
      {clip.transitionOut && (
        <div className="absolute bottom-0 right-0 top-0 bg-background/30" style={{ width: clip.transitionOut.duration * pps }} />
      )}
      {clip.kind === 'audio' && <AudioClipVolume clip={clip} store={store} locked={locked} />}
      {[...kfTimes].map((t) => (
        <div
          key={t}
          className="absolute bottom-1 h-2 w-2 -translate-x-1 rotate-45 bg-foreground"
          style={{ left: t * pps }}
        />
      ))}
      <div className="absolute bottom-0 left-0 top-0 z-10 w-3 cursor-ew-resize bg-foreground/0 hover:bg-foreground/40" data-trim-edge="l" onPointerDown={(e) => onDown(e, "l")} />
      <div className="absolute bottom-0 right-0 top-0 z-10 w-3 cursor-ew-resize bg-foreground/0 hover:bg-foreground/40" data-trim-edge="r" onPointerDown={(e) => onDown(e, "r")} />
    </div>
  );
}

/**
 * A transition as the timeline object it is: its own block in the lane's transition band, starting
 * at the cut and exactly as wide as the blend it performs. It is not part of either clip rectangle,
 * so selecting, stretching, squeezing or deleting it never changes a clip's length - the video the
 * user cut stays the same size no matter what the join does.
 */
function TransitionBlock({ clip, prev, pps, store, track, hovering }: {
  clip: Clip;
  prev: Clip | null;
  pps: number;
  store: EditorStore;
  track: Track;
  hovering: boolean;
}) {
  const selected = useEditor(store, (s) => s.selectedTransitionOf === clip.id);
  const span = transitionBlockSpan(clip);
  const trans = clip.transitionIn;
  if (!span || !trans) return null;
  const maxDur = maxTransitionDuration(prev, clip);
  // a blend shorter than a few pixels still has to be clickable
  const w = Math.max(span.duration * pps, MIN_TRANS_W);
  // straddle the joint evenly: equal amounts under both clips, never stuck to one of them
  const left = Math.max(0, span.center * pps - w / 2);
  const name = transitionName(trans.type);

  const setDuration = (dur: number) => {
    const clamped = Math.max(0.1, Math.min(maxDur, dur));
    store.updateClip(clip.id, (c) => ({
      ...c,
      transitionIn: c.transitionIn ? { ...c.transitionIn, duration: clamped } : undefined,
    }));
  };

  // An edge follows the pointer 1:1, and because the block stays centred on the cut, moving one
  // edge by n pixels lengthens the blend by twice that - trim it from either side freely.
  const startTrimDrag = (side: "l" | "r") => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    selectTransition(store, clip.id);
    if (track.locked) return;
    store.beginGesture();
    const startX = e.clientX;
    const origDur = trans.duration;
    const sign = side === "l" ? -2 : 2;
    const move = (ev: PointerEvent) => setDuration(origDur + (sign * (ev.clientX - startX)) / store.get().pxPerSec);
    const up = () => {
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Grabbing the body squeezes or stretches around the joint without moving it.
  const startBodyDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    selectTransition(store, clip.id);
    if (track.locked) return;
    store.beginGesture();
    const startX = e.clientX;
    const origDur = trans.duration;
    const move = (ev: PointerEvent) => setDuration(origDur + (ev.clientX - startX) / store.get().pxPerSec);
    const up = () => {
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      data-transition-for={clip.id}
      role="button"
      tabIndex={0}
      aria-label={`${name} transition, ${trans.duration.toFixed(2)} seconds`}
      title={`${name} · ${trans.duration.toFixed(2)}s - sits on the joint between the clips; trim either end, arrows to nudge, Del to remove`}
      className={cn(
        "absolute inset-y-[3px] z-20 flex select-none items-center overflow-hidden rounded-sm border text-[9px] font-bold",
        selected
          ? "cursor-ew-resize border-primary bg-primary/25 text-primary ring-1 ring-primary/60"
          : hovering
            ? "border-dashed border-primary bg-card text-primary"
            : "border-border bg-card text-foreground/80 hover:border-primary/60 hover:text-primary",
      )}
      style={{ left, width: w }}
      onPointerDown={startBodyDrag}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          selectTransition(store, clip.id);
          return;
        }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        // the lane's arrows seek; on the block itself they retime the blend
        e.preventDefault();
        e.stopPropagation();
        if (track.locked) return;
        const step = (e.shiftKey ? 0.1 : 1 / 30) * (e.key === "ArrowLeft" ? -1 : 1);
        setDuration(trans.duration + step);
      }}
    >
      {/* neither half is the clip's own colour: the block is its own object, not a piece of video */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary/70" />
      <span className="relative min-w-0 flex-1 truncate pl-1.5">{name}</span>
      {w >= 68 && <span className="relative shrink-0 font-mono tabular-nums opacity-70">{trans.duration.toFixed(2)}s</span>}
      {selected && (
        <button
          aria-label="Remove transition"
          title="Remove this transition"
          className="relative grid size-4 shrink-0 place-items-center rounded bg-primary/30 hover:bg-primary/60"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            removeTransition(store, clip.id);
          }}
        >
          <X className="size-2.5" />
        </button>
      )}
      <span
        data-transition-edge="l"
        aria-label="Trim transition start"
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-primary/45"
        onPointerDown={startTrimDrag("l")}
      />
      <span
        data-transition-edge="r"
        aria-label="Trim transition end"
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-primary/45"
        onPointerDown={startTrimDrag("r")}
      />
    </div>
  );
}
