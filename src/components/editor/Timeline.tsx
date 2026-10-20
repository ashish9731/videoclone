import { useEffect, useRef } from "react";
import { AudioClipVolume } from './AudioClipVolume';
import {
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
  type Clip,
  type MediaAsset,
  type Track,
  type TrackKind,
  clipDuration,
  clipEnd,
  clipFromAsset,
  newTrack,
  splitClip,
  textClip,
  timelineDuration,
  uid,
} from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { prevAdjacent } from "@/lib/editor/transitions";
import { insertFreeze, trimAtPlayhead } from '@/lib/editor/edit-actions';

const HEADER_W = 168;
const RULER_H = 26;
const rowH = (k: TrackKind) => (k === "video" ? 60 : k === "audio" ? 48 : 40);

export const ASSET_MIME = "application/x-cutroom-asset";

// True between dragstart and dragend of an internal asset drag. Engines differ
// in whether custom dataTransfer types appear in dragover `types` (Safari can
// drop them entirely), so the flag is the belt-and-braces gate for lanes.
let assetDragActive = false;
export function beginAssetDrag() {
  assetDragActive = true;
}
export function endAssetDrag() {
  assetDragActive = false;
}

const hasAssetPayload = (e: React.DragEvent) =>
  assetDragActive || e.dataTransfer.types.some((t) => t.toLowerCase() === ASSET_MIME);

/** Data written by a media drag: the custom MIME first, text/plain for engines
 *  that only propagate standard formats. */
export function writeAssetDrag(e: React.DragEvent, id: string) {
  e.dataTransfer.setData(ASSET_MIME, id);
  e.dataTransfer.setData("text/plain", id);
  e.dataTransfer.effectAllowed = "copy";
  beginAssetDrag();
}

export function accepts(track: TrackKind, clip: Clip["kind"]): boolean {
  if (track === "video") return clip === "video" || clip === "image";
  if (track === "audio") return clip === "audio";
  return clip === "text" || clip === "shape";
}

export function trackKindFor(clip: Clip["kind"]): TrackKind {
  return clip === "audio" ? "audio" : clip === "text" || clip === "shape" ? "text" : "video";
}

/** Insert a clip into the first compatible track, creating one if needed. */
export function addClipToTimeline(store: EditorStore, clip: Clip, preferTrackId?: string) {
  store.update((t) => {
    const tracks = [...t.tracks];
    let idx = tracks.findIndex((tr) => tr.id === preferTrackId && accepts(tr.kind, clip.kind) && !tr.locked);
    if (idx < 0 && clip.kind !== 'text' && clip.kind !== 'shape') idx = tracks.findIndex((tr) => accepts(tr.kind, clip.kind) && !tr.locked);
    if (idx < 0) {
      const kind = trackKindFor(clip.kind);
      const n = tracks.filter((tr) => tr.kind === kind).length + 1;
      const tr = newTrack(kind, n);
      if (kind === "audio") tracks.push(tr);
      else tracks.unshift(tr);
      idx = kind === "audio" ? tracks.length - 1 : 0;
    }
    const target = tracks[idx];
    if (!target) return t;
    tracks[idx] = { ...target, clips: [...target.clips, clip] };
    return { tracks };
  });
  // Stop at a visible point after entrance animations; never leave the playhead
  // at a clip's exclusive end or behind the newly inserted overlay.
  store.set({ selectedClipId: clip.id, playing: false, time: clip.start + Math.min(0.25, clipDuration(clip) / 2), inspectorTab: clip.kind === 'text' ? 'text' : clip.kind === 'shape' ? 'shape' : 'basic' });
}

const clipColor: Record<Clip["kind"], string> = {
  video: "bg-clip-video",
  image: "bg-clip-image",
  audio: "bg-clip-audio",
  text: "bg-clip-text",
  shape: "bg-clip-image",
};

interface Props {
  store: EditorStore;
  assets: Map<string, MediaAsset>;
}

export function Timeline({ store, assets }: Props) {
  const timeline = useEditor(store, (s) => s.timeline);
  const selected = useEditor(store, (s) => s.selectedClipId);
  const pps = useEditor(store, (s) => s.pxPerSec);
  const snapping = useEditor(store, (s) => s.snapping);
  const canUndo = useEditor(store, (s) => s.canUndo);
  const canRedo = useEditor(store, (s) => s.canRedo);
  const scrollRef = useRef<HTMLDivElement>(null);

  const duration = timelineDuration(timeline);
  const contentW = Math.max(1200, (duration + 30) * pps);

  const timeAtClientX = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left - HEADER_W + el.scrollLeft) / pps);
  };

  const seekDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    store.set({ playing: false, time: timeAtClientX(e.clientX) });
    const move = (ev: PointerEvent) => store.set({ time: timeAtClientX(ev.clientX) });
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
    const id = e.dataTransfer.getData(ASSET_MIME) || e.dataTransfer.getData("text/plain");
    const a = assets.get(id);
    if (!a) return;
    // Free placement: the drop X is the clip start (snapped when enabled); the
    // lane under the cursor is only a preference, otherwise the first
    // compatible track receives the clip.
    let time = timeAtClientX(e.clientX);
    if (store.get().snapping) {
      const thr = 8 / store.get().pxPerSec;
      for (const p of snapPoints("")) if (Math.abs(time - p) < thr) time = Math.max(0, p);
    }
    const lane = (e.target as HTMLElement).closest?.("[data-track-id]") as HTMLElement | null;
    addClipToTimeline(store, clipFromAsset(a, time), lane?.dataset["trackId"]);
  };

  const split = () => {
    const { selectedClipId, time } = store.get();
    const hit = store.findClip(selectedClipId);
    const targets = hit
      ? [hit.clip]
      : store.get().timeline.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.filter((c) => time > c.start && time < clipEnd(c)));
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
    const id = store.get().selectedClipId;
    if (!id) return;
    store.update((t) => ({ tracks: t.tracks.map((tr) => (tr.locked ? tr : { ...tr, clips: tr.clips.filter((c) => c.id !== id) })) }));
    store.set({ selectedClipId: null });
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
        const dur = timelineDuration(s.timeline);
        store.set({ playing: !s.playing, time: !s.playing && s.time >= dur ? 0 : s.time });
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
      else if (e.key === "ArrowLeft") store.set({ time: Math.max(0, store.get().time - (e.shiftKey ? 1 : 1 / 30)), playing: false });
      else if (e.key === "ArrowRight") store.set({ time: store.get().time + (e.shiftKey ? 1 : 1 / 30), playing: false });
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
        <Button size="icon" variant="ghost" onClick={del} disabled={!selected} aria-label="Delete clip" title="Delete (Del)">
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
          }
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

          {timeline.tracks.map((tr) => (
            <div key={tr.id} className="flex border-b" style={{ height: rowH(tr.kind) }}>
              <TrackHeader track={tr} store={store} />
              <div
                data-track-id={tr.id}
                className={cn("relative flex-1", tr.locked ? "bg-muted/40" : "bg-background/40")}
                onPointerDown={(e) => {
                  store.set({ selectedClipId: null });
                  seekDrag(e);
                }}
              >
                {tr.kind !== "audio" &&
                  tr.clips.map((c) => {
                    const prev = prevAdjacent(tr, c);
                    if (!prev) return null;
                    const has = !!c.transitionIn;
                    return (
                      <button
                        key={`j-${c.id}`}
                        className={cn(
                          "absolute top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border text-[10px] font-bold",
                          has ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                        )}
                        style={{ left: c.start * pps }}
                        title={has ? "Edit transition" : "Add transition between these clips"}
                        aria-label={has ? "Edit transition" : "Add transition"}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!has && !tr.locked)
                            store.updateClip(c.id, (cl) => ({ ...cl, transitionIn: { type: "fade", duration: Math.min(0.8, clipDuration(cl) / 2) } }));
                          store.set({ selectedClipId: c.id, inspectorTab: "trans" });
                        }}
                      >
                        ⋈
                      </button>
                    );
                  })}
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
            </div>
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
        {(clip.filter || clip.fx?.length) && <span className="rounded bg-background/60 px-1 font-mono">fx</span>}
      </div>
      {clip.transitionIn && (
        <div className="absolute bottom-0 left-0 top-0 bg-background/30" style={{ width: clip.transitionIn.duration * pps }} />
      )}
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
