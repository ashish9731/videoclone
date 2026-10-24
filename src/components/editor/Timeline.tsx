import { Fragment, type CSSProperties, useEffect, useRef, useState } from "react";
import { AudioClipVolume } from "./AudioClipVolume";
import {
  Captions,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Magnet,
  Minus,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Volume2,
  VolumeX,
  Snowflake,
  Crop,
  PanelLeftClose,
  PanelRightClose,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
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
import { clipboardLabel, copySelection, pasteClipboard } from "@/lib/editor/clipboard";
import {
  maxTransitionDuration,
  nextAdjacent,
  prevAdjacent,
  transitionBlockSpan,
  transitionName,
} from "@/lib/editor/transitions";
import {
  accepts,
  addClipToTimeline,
  removeTransition,
  seamTargetAt,
  selectTransition,
} from "@/lib/editor/placement";
import {
  ASSET_MIME,
  activeDragPreset,
  applyPresetAt,
  hasAssetPayload,
  parsePresetPayload,
} from "./library-drag";
import { insertFreeze, trimAtPlayhead } from "@/lib/editor/edit-actions";

const HEADER_W = 168;
const RULER_H = 26;
const rowH = (k: TrackKind) =>
  k === "video" ? 60 : k === "audio" ? 48 : k === "effect" ? 40 : k === "filter" ? 40 : 40;
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
  /** opens the export dialog so the user can combine the full timeline into one video */
  onExport?: (() => void) | undefined;
}

/**
 * A live drag that keeps the lane scrolling while the pointer rides either border, so a long clip
 * or blend can be trimmed far past what currently fits on screen. `track` is fed every pointer move
 * (including the one that started the drag); `close` stops the pan when the button is released.
 */
interface DragController {
  track: (clientX: number, clientY?: number) => void;
  close: () => void;
}

/** Shared by the timeline body and the transition blocks so both trim in scrolled timeline time. */
interface DragCtx {
  /** client X -> timeline seconds, accounting for the lane's horizontal scroll */
  timeAt: (clientX: number) => number;
  open: () => DragController;
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
  onExport,
}: Props) {
  const timeline = useEditor(store, (s) => s.timeline);
  const selected = useEditor(store, (s) => s.selectedClipId);
  const selectedIds = useEditor(store, (s) => s.selectedClipIds);
  const selectedTransitionOf = useEditor(store, (s) => s.selectedTransitionOf);
  /** the caption cue the user pointed at - the only copy target that lives outside the timeline */
  const selectedCueId = useEditor(store, (s) => s.selectedCueId);
  /** what Ctrl+V would place, so the paste button and its tooltip can say so */
  const clipboard = useEditor(store, (s) => s.clipboard);
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
    // only the left button seeks: a right-click opens the context menu, it must not move the playhead
    if (e.button !== 0) return;
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

  /**
   * Edge auto-scroll while a drag runs: when the pointer rides the lane's left or right border the
   * view pans, so a clip or blend can be trimmed or moved far past what fits on screen. It only
   * engages once the lane actually overflows, so a short timeline never drifts.
   */
  const openDrag = (): DragController => {
    const el = scrollRef.current;
    let raf = 0;
    let px = 0;
    const step = () => {
      if (el && el.scrollWidth > el.clientWidth + 1) {
        const rect = el.getBoundingClientRect();
        const EDGE = 56;
        const leftBound = rect.left + HEADER_W + EDGE;
        const rightBound = rect.right - EDGE;
        let d = 0;
        if (px >= rightBound) d = Math.min(28, (px - rightBound) * 0.3);
        else if (px > 0 && px <= leftBound) d = -Math.min(28, (leftBound - px) * 0.3);
        if (d !== 0) el.scrollLeft = Math.max(0, el.scrollLeft + d);
      }
      raf = requestAnimationFrame(step);
    };
    return {
      track: (clientX: number) => {
        px = clientX;
        if (!raf) raf = requestAnimationFrame(step);
      },
      close: () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
    };
  };

  const dragCtx: DragCtx = { timeAt: timeAtClientX, open: openDrag };

  /**
   * An effect or filter block has no finite media source to scrub into - its whole window is
   * [start, start+duration]. Treating it as a uniform block lets the LEFT edge extend backwards
   * freely instead of stalling against `in >= 0`, so both ends trim the same way the right one did.
   */
  const isUniformBlock = (c: Clip) => c.kind === "effect" || c.kind === "filter";

  const startClipDrag = (
    e: React.PointerEvent,
    clip: Clip,
    track: Track,
    mode: "move" | "l" | "r",
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    store.set({ selectedClipId: clip.id });
    if (track.locked) return;
    store.beginGesture();
    const ctrl = openDrag();
    // deltas in scrolled timeline seconds: the cut stays under the cursor even once the lane pans
    const startTime = timeAtClientX(e.clientX);
    const orig = clip;
    const pts = snapPoints(clip.id);
    const d = clipDuration(orig);
    const uniform = isUniformBlock(orig);
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
      ctrl.track(ev.clientX);
      const dx = timeAtClientX(ev.clientX) - startTime;
      if (mode === "move") {
        let ns = Math.max(0, orig.start + dx);
        const s1 = snap(ns);
        if (s1 !== null && s1 !== ns) ns = s1;
        else {
          const s2 = snap(ns + d);
          if (s2 !== null && s2 !== ns + d) ns = Math.max(0, s2 - d);
        }
        const hit = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest("[data-track-id]") as HTMLElement | null;
        const target = hit?.dataset["trackId"];
        const tgtTrack = store.get().timeline.tracks.find((t) => t.id === target);
        if (tgtTrack && !tgtTrack.locked && accepts(tgtTrack.kind, orig.kind))
          curTrackId = tgtTrack.id;
        store.update((t) => {
          const moved = { ...orig, start: ns };
          return {
            tracks: t.tracks.map((tr) => {
              const rest = tr.clips.filter((c) => c.id !== orig.id);
              return tr.id === curTrackId
                ? { ...tr, clips: [...rest, moved] }
                : { ...tr, clips: rest };
            }),
          };
        });
      } else if (mode === "l") {
        if (uniform) {
          // move the start, hold the end fixed - the left edge grows or shrinks the block
          let newStart = orig.start + dx;
          const s = snap(newStart);
          if (s !== null) newStart = s;
          const end = clipEnd(orig);
          newStart = Math.max(0, Math.min(newStart, end - 0.1));
          store.updateClip(orig.id, (c) => ({ ...c, start: newStart, in: 0, out: end - newStart }));
        } else {
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
        }
      } else {
        if (uniform) {
          // push the end forward or back; the start never moves, so this mirrors the left edge
          let newEnd = clipEnd(orig) + dx;
          const s = snap(newEnd);
          if (s !== null) newEnd = s;
          newEnd = Math.max(orig.start + 0.1, newEnd);
          store.updateClip(orig.id, (c) => ({ ...c, in: 0, out: newEnd - c.start }));
        } else {
          let newEnd = orig.start + d + dx;
          const s = snap(newEnd);
          if (s !== null) newEnd = s;
          let newOut = orig.in + (newEnd - orig.start) * rate;
          newOut = Math.min(orig.sourceDuration, Math.max(orig.in + 0.1 * rate, newOut));
          store.updateClip(orig.id, (c) => ({ ...c, out: newOut }));
        }
      }
    };
    const up = () => {
      ctrl.close();
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    ctrl.track(e.clientX);
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
      applyPresetAt(store, preset.tab, preset.id, {
        time,
        trackId,
        pxPerSec: store.get().pxPerSec,
        width,
        height,
      });
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
    const seam = seamTargetAt(
      store.get().timeline.tracks,
      timeAtClientX(e.clientX),
      8 / pps,
      lane?.dataset["trackId"],
    );
    const next = seam?.clip.id ?? null;
    setSeamHover((cur) => (cur === next ? cur : next));
  };

  const split = () => {
    const { selectedClipId, time } = store.get();
    const hit = store.findClip(selectedClipId);
    const spans = (c: Clip) => time > c.start && time < clipEnd(c);
    const targets =
      hit && spans(hit.clip)
        ? [hit.clip]
        : store
            .get()
            .timeline.tracks.filter((t) => !t.locked)
            .flatMap((t) => t.clips.filter(spans));
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
    const { selectedClipId, selectedTransitionOf, selectedCueId } = store.get();
    if (!selectedClipId) {
      // a caption cue on its own lane is the only other thing a click can aim at
      if (selectedCueId) {
        const owner = captions.find((t) => t.cues.some((c) => c.id === selectedCueId));
        if (owner) deleteCue(selectedCueId, owner.id);
      }
      return;
    }
    // a selected transition is its own object: Del removes the blend, never the clip under it
    if (selectedTransitionOf === selectedClipId) removeTransition(store, selectedClipId);
    else {
      store.update((t) => ({
        tracks: t.tracks.map((tr) =>
          tr.locked ? tr : { ...tr, clips: tr.clips.filter((c) => c.id !== selectedClipId) },
        ),
      }));
      store.set({ selectedClipId: null });
    }
  };

  const trim = (side: "left" | "right") => {
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
    store.updateTrack(hit.track.id, (tr) => ({
      ...tr,
      clips: tr.clips.flatMap((c) =>
        c.id === hit.clip.id ? parts : c.start >= time ? [{ ...c, start: c.start + 3 }] : [c],
      ),
    }));
    store.set({ selectedClipId: parts.find((c) => c.freezeAt !== undefined)?.id ?? null });
  };

  const duplicate = () => {
    const hit = store.findClip(store.get().selectedClipId);
    if (!hit) return;
    const copy = { ...hit.clip, id: uid(), start: clipEnd(hit.clip) };
    store.updateTrack(hit.track.id, (tr) => ({ ...tr, clips: [...tr.clips, copy] }));
    store.set({ selectedClipId: copy.id });
  };

  /**
   * Copy holds the aimed object - a clip of any kind, a transition block or a caption cue - and
   * falls back to whatever sits under the playhead, so it works without a separate selection step.
   */
  const doCopy = () => {
    const item = copySelection(store, captions);
    if (item)
      toast.success(`Copied ${clipboardLabel(item)}`, {
        description: "Paste puts it down at the playhead.",
      });
    else
      toast.info("Nothing to copy", {
        description: "Click a clip, a transition block or a caption line first.",
      });
  };

  const doPaste = () => {
    const result = pasteClipboard(store, {
      tracks: captions,
      update: (id, fn) => onUpdateCaption?.(id, fn),
    });
    if (!result.ok) {
      if (result.reason === "empty")
        toast.info("Clipboard is empty", {
          description: "Copy a clip, transition or caption first.",
        });
      else if (result.reason === "no-seam")
        toast.info("No joint here", {
          description: "A transition needs two touching clips - park the playhead on one.",
        });
      else
        toast.info("That caption line is gone", {
          description: "The track the cue came from is no longer in the project.",
        });
      return;
    }
    // say so when a blend was trimmed to the joint: the effect is kept, only its length fits itself
    if (result.kind === "transition" && result.clamped)
      toast.success("Pasted transition shortened to fit this joint", {
        description: "Trim either clip to get the full length back.",
      });
  };

  const deleteCue = (cueId: string, trackId: string) => {
    onUpdateCaption?.(trackId, (t) => ({ ...t, cues: t.cues.filter((c) => c.id !== cueId) }));
    store.set({ selectedCueId: null });
  };

  /** Copy is only offered when there is something on the timeline to aim at. */
  const hasMaterial = timeline.tracks.some((tr) => tr.clips.length > 0) || captions.length > 0;

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.closest('[role="slider"], [role="combobox"]') ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        const s = store.get();
        store.set({
          playing: !s.playing,
          time: !s.playing && s.time >= lastFrameTime(s.timeline, fps) ? 0 : s.time,
        });
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        store.selectAllClips();
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
      } else if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        doCopy();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        doPaste();
      } else if (e.key === "s" || e.key === "S") split();
      else if (e.key === "Delete" || e.key === "Backspace") del();
      else if (e.key === "Escape") store.set({ selectedClipId: null, selectedCueId: null });
      else if (e.key === "ArrowLeft")
        store.set({
          time: clampPlayhead(
            store.get().time - (e.shiftKey ? 1 : 1 / fps),
            store.get().timeline,
            fps,
          ),
          playing: false,
        });
      else if (e.key === "ArrowRight")
        store.set({
          time: clampPlayhead(
            store.get().time + (e.shiftKey ? 1 : 1 / fps),
            store.get().timeline,
            fps,
          ),
          playing: false,
        });
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
        <Button
          size="icon"
          variant="ghost"
          disabled={!canUndo}
          onClick={() => store.undo()}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={!canRedo}
          onClick={() => store.redo()}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={split} title="Split at playhead (S)">
          <Scissors className="mr-1 h-4 w-4" /> Split
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={duplicate}
          disabled={!selected}
          aria-label="Duplicate"
          title="Duplicate (Ctrl+D)"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={doCopy}
          disabled={!hasMaterial}
          aria-label="Copy"
          title="Copy the selected clip, transition or caption (Ctrl+C)"
        >
          <ClipboardCopy className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={clipboard ? "secondary" : "ghost"}
          onClick={doPaste}
          disabled={!clipboard}
          aria-label="Paste"
          title={
            clipboard
              ? `Paste ${clipboardLabel(clipboard)} at the playhead (Ctrl+V)`
              : "Paste (Ctrl+V) - nothing copied yet"
          }
        >
          <ClipboardPaste className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => trim("left")}
          disabled={!selected}
          aria-label="Trim left"
          title="Trim left to playhead"
        >
          <PanelLeftClose className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => trim("right")}
          disabled={!selected}
          aria-label="Trim right"
          title="Trim right to playhead"
        >
          <PanelRightClose className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={freeze}
          disabled={!selected || store.findClip(selected)?.clip.kind !== "video"}
          aria-label="Freeze frame"
          title="Insert 3-second freeze frame"
        >
          <Snowflake className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => store.set({ inspectorTab: "crop" })}
          disabled={!selected}
          aria-label="Crop clip"
          title="Crop"
        >
          <Crop className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={del}
          disabled={!selected}
          aria-label={
            selected && selectedTransitionOf === selected ? "Remove transition" : "Delete clip"
          }
          title={
            selected && selectedTransitionOf === selected
              ? "Remove this transition (Del)"
              : "Delete clip (Del)"
          }
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => addClipToTimeline(store, textClip(store.get().time))}
        >
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
        <div className="ml-auto flex w-56 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() =>
              store.set({ pxPerSec: Math.max(8, Math.min(400, Math.round(pps / 1.2))) })
            }
            disabled={pps <= 8}
            aria-label="Zoom out timeline"
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Slider
            min={8}
            max={400}
            step={1}
            value={[pps]}
            onValueChange={([v]) => store.set({ pxPerSec: v ?? 60 })}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() =>
              store.set({ pxPerSec: Math.max(8, Math.min(400, Math.round(pps * 1.2))) })
            }
            disabled={pps >= 400}
            aria-label="Zoom in timeline"
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </Button>
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
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null))
            setSeamHover(null);
        }}
        onDrop={onDrop}
      >
        <div className="relative" style={{ width: HEADER_W + contentW }}>
          {/* ruler */}
          <div className="sticky top-0 z-30 flex" style={{ height: RULER_H }}>
            <div
              className="sticky left-0 z-40 shrink-0 border-b border-r bg-panel"
              style={{ width: HEADER_W }}
            />
            <div
              data-ruler
              className="relative flex-1 cursor-pointer border-b bg-card"
              onPointerDown={seekDrag}
            >
              {ticks.map((s) => (
                <div
                  key={s}
                  className="absolute top-0 h-full border-l border-border"
                  style={{ left: s * pps }}
                >
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {Math.floor(s / 60)}:{String(Math.floor(s % 60)).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {timeline.tracks.map((tr) => {
            return (
              <div key={tr.id} className="flex border-b" style={{ height: rowH(tr.kind) }}>
                <TrackHeader track={tr} store={store} />
                <div
                  data-track-id={tr.id}
                  className={cn("relative flex-1", tr.locked ? "bg-muted/40" : "bg-background/40")}
                  onPointerDown={(e) => {
                    // only a left click aims the empty lane: a right click is opening the block menu,
                    // so it must not first wipe a Ctrl+A multi-selection the user is about to act on
                    if (e.button !== 0) return;
                    store.set({ selectedClipId: null, selectedCueId: null });
                    seekDrag(e);
                  }}
                >
                  {/* Clips are display-shortened where a transition sits, and the block renders
                      in the freed gap as a sibling - no overlay, no z-index, no overlap. */}
                  <div className="absolute inset-x-0 bottom-0 top-0">
                    {tr.clips.map((c) => {
                      // This clip's left edge shortened by its own incoming transition
                      const mySpan = transitionBlockSpan(c);
                      let dispLeft = c.start;
                      if (mySpan) dispLeft = Math.max(c.start, mySpan.start + mySpan.duration);
                      // This clip's right edge shortened by the next clip's incoming transition
                      // (only visual clips participate in transitions; audio/effect blocks stay whole)
                      let dispRight = clipEnd(c);
                      if (isVisualClip(c)) {
                        const next = nextAdjacent(tr, c);
                        const nextSpan = next ? transitionBlockSpan(next) : null;
                        if (nextSpan) dispRight = Math.min(clipEnd(c), nextSpan.start);
                      }

                      return (
                        <Fragment key={c.id}>
                          <BlockMenu
                            label={
                              c.kind === "text" ? c.text?.content || "Text clip" : c.name || "Clip"
                            }
                            items={[
                              {
                                label: "Copy",
                                shortcut: "Ctrl+C",
                                run: () => {
                                  store.set({ selectedClipId: c.id });
                                  doCopy();
                                },
                              },
                              {
                                label: "Duplicate",
                                shortcut: "Ctrl+D",
                                run: () => {
                                  store.set({ selectedClipId: c.id });
                                  duplicate();
                                },
                                disabled: tr.locked,
                              },
                              {
                                label: "Paste at playhead",
                                shortcut: "Ctrl+V",
                                run: doPaste,
                                disabled: !clipboard,
                              },
                              {
                                label: "Select All",
                                shortcut: "Ctrl+A",
                                run: () => store.selectAllClips(),
                              },
                              {
                                label: "Combine",
                                run: () => {
                                  store.selectAllClips();
                                  onExport?.();
                                },
                              },
                              {
                                label: "Delete",
                                shortcut: "Del",
                                run: () => {
                                  store.set({ selectedClipId: c.id });
                                  del();
                                },
                                disabled: tr.locked,
                              },
                            ]}
                          >
                            <ClipBlock
                              clip={c}
                              pps={pps}
                              displayLeft={dispLeft * pps}
                              displayWidth={Math.max(4, (dispRight - dispLeft) * pps)}
                              selected={c.id === selected}
                              multiSelected={selectedIds.length > 1 && selectedIds.includes(c.id)}
                              dim={tr.hidden || tr.muted}
                              store={store}
                              locked={tr.locked}
                              onDown={(e, mode) => startClipDrag(e, c, tr, mode)}
                            />
                          </BlockMenu>
                          {mySpan && (
                            <BlockMenu
                              label="Transition"
                              items={[
                                {
                                  label: "Copy transition",
                                  shortcut: "Ctrl+C",
                                  run: () => {
                                    store.set({
                                      selectedClipId: c.id,
                                      selectedTransitionOf: c.id,
                                    });
                                    doCopy();
                                  },
                                },
                                {
                                  label: "Paste on this joint",
                                  shortcut: "Ctrl+V",
                                  run: () => {
                                    store.set({ time: c.start, playing: false });
                                    doPaste();
                                  },
                                  disabled: !clipboard,
                                },
                                {
                                  label: "Remove transition",
                                  shortcut: "Del",
                                  run: () => removeTransition(store, c.id),
                                  disabled: tr.locked,
                                },
                              ]}
                            >
                              <TransitionBlock
                                clip={c}
                                prev={prevAdjacent(tr, c)}
                                pps={pps}
                                store={store}
                                track={tr}
                                hovering={seamHover === c.id}
                                drag={dragCtx}
                              />
                            </BlockMenu>
                          )}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {/* Caption cues get lines of their own under the picture: a cue is never drawn inside a
              video row, it is a block on the track it belongs to. */}
          {captions.map((ct) => (
            <CaptionLane
              key={ct.id}
              track={ct}
              pps={pps}
              store={store}
              onUpdate={onUpdateCaption}
              onActive={onActiveCaption}
              selectedCueId={selectedCueId}
              hasClipboard={Boolean(clipboard)}
              onCopy={doCopy}
              onPaste={doPaste}
            />
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
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-playhead"
      style={{ left: HEADER_W + time * pps }}
    >
      <div className="-ml-[5px] h-3 w-[11px] rounded-b-sm bg-playhead" />
    </div>
  );
}

/**
 * The right-click menu every timeline object carries. Items aim the selection themselves before they
 * run, so "Copy" on a clip takes that clip even when another object was selected when the menu opened
 * - exactly what a native context menu does, and what makes one object reusable somewhere else.
 */
function BlockMenu({
  label,
  items,
  children,
}: {
  label: string;
  items: { label: string; shortcut?: string; run: () => void; disabled?: boolean }[];
  children: React.ReactElement;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuLabel className="max-w-52 truncate">{label}</ContextMenuLabel>
        {items.map((item) => (
          <ContextMenuItem key={item.label} disabled={item.disabled} onSelect={item.run}>
            {item.label}
            {item.shortcut && <ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TrackHeader({ track, store }: { track: Track; store: EditorStore }) {
  const toggle = (k: "muted" | "hidden" | "locked") =>
    store.updateTrack(track.id, (t) => ({ ...t, [k]: !t[k] }));
  return (
    <div
      className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-r bg-panel px-2"
      style={{ width: HEADER_W }}
    >
      <span className="flex-1 truncate text-xs font-medium">{track.name}</span>
      {track.kind !== "text" && (
        <button
          className="rounded p-1 hover:bg-accent"
          onClick={() => toggle("muted")}
          aria-label="Mute track"
        >
          {track.muted ? (
            <VolumeX className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      )}
      {track.kind !== "audio" && (
        <button
          className="rounded p-1 hover:bg-accent"
          onClick={() => toggle("hidden")}
          aria-label="Hide track"
        >
          {track.hidden ? (
            <EyeOff className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      )}
      <button
        className="rounded p-1 hover:bg-accent"
        onClick={() => toggle("locked")}
        aria-label="Lock track"
      >
        {track.locked ? (
          <Lock className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
        )}
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
  selectedCueId,
  hasClipboard,
  onCopy,
  onPaste,
}: {
  track: CaptionTrack;
  pps: number;
  store: EditorStore;
  onUpdate?: ((id: string, fn: (t: CaptionTrack) => CaptionTrack) => void) | undefined;
  onActive?: ((id: string) => void) | undefined;
  /** the cue Copy should take - a cue lives in the caption track, not in the timeline JSON */
  selectedCueId: string | null;
  hasClipboard: boolean;
  onCopy: () => void;
  onPaste: () => void;
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

  const removeCue = (cueId: string) => {
    onUpdate?.(track.id, (t) => ({ ...t, cues: t.cues.filter((c) => c.id !== cueId) }));
    store.set({ selectedCueId: null });
  };

  const startDrag = (e: React.PointerEvent, cue: CaptionCue, mode: "move" | "l" | "r") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onActive?.(track.id);
    // landing on the cue is what shows its text in the caption editor, and aims Copy at it
    store.set({
      selectedClipId: null,
      selectedCueId: cue.id,
      playing: false,
      time: mode === "r" ? cue.end : cue.start,
    });
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
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-r bg-panel px-2"
        style={{ width: HEADER_W }}
      >
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
            {track.visible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
      <div
        data-caption-track={track.id}
        className={cn("relative flex-1", track.visible ? "bg-background/40" : "bg-muted/30")}
        onPointerDown={() => {
          store.set({ selectedClipId: null, selectedCueId: null });
        }}
      >
        {track.cues.map((cue) => {
          const w = Math.max(6, (cue.end - cue.start) * pps);
          const on = cue.id === currentCueId || cue.id === selectedCueId;
          return (
            <BlockMenu
              key={cue.id}
              label={cue.text || "Caption"}
              items={[
                {
                  label: "Copy caption",
                  shortcut: "Ctrl+C",
                  run: () => {
                    store.set({ selectedCueId: cue.id });
                    onCopy();
                  },
                },
                {
                  label: "Paste at playhead",
                  shortcut: "Ctrl+V",
                  run: onPaste,
                  disabled: !hasClipboard,
                },
                {
                  label: "Delete caption",
                  shortcut: "Del",
                  run: () => removeCue(cue.id),
                  disabled: !onUpdate,
                },
              ]}
            >
              <div
                data-caption-cue={cue.id}
                role="button"
                tabIndex={0}
                aria-label={`Caption "${cue.text}" ${cue.start.toFixed(2)} to ${cue.end.toFixed(2)} seconds`}
                title="Drag to move, trim either end, click to edit the text"
                className={cn(
                  "absolute inset-y-[3px] flex cursor-grab select-none items-center overflow-hidden rounded-md border px-1.5 text-[10px] active:cursor-grabbing",
                  on
                    ? "border-primary bg-primary/25 text-primary"
                    : "border-border bg-clip-text text-foreground/80",
                  !track.visible && "opacity-40",
                )}
                style={{ left: cue.start * pps, width: w }}
                onPointerDown={(e) => startDrag(e, cue, "move")}
                onContextMenu={() => store.set({ selectedCueId: cue.id })}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  onActive?.(track.id);
                  store.set({
                    selectedClipId: null,
                    selectedCueId: cue.id,
                    playing: false,
                    time: cue.start,
                  });
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
            </BlockMenu>
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
  multiSelected,
  dim,
  onDown,
  store,
  locked,
  displayLeft,
  displayWidth,
  ...rest
}: {
  clip: Clip;
  pps: number;
  selected: boolean;
  multiSelected?: boolean;
  dim: boolean;
  store: EditorStore;
  locked: boolean;
  onDown: (e: React.PointerEvent, mode: "move" | "l" | "r") => void;
  displayLeft?: number;
  displayWidth?: number;
} & React.ComponentProps<"div">) {
  const d = clipDuration(clip);
  const w = displayWidth ?? Math.max(4, d * pps);
  const kfTimes = new Set<number>();
  Object.values(clip.keyframes).forEach((arr) =>
    arr?.forEach((k) => kfTimes.add(Math.round(k.t * 100) / 100)),
  );
  return (
    <div
      // the block menu is attached through `asChild`, so this element has to carry what it is
      // handed - and keep its own drag, which the merged pointer down still has to run
      {...rest}
      data-clip-id={clip.id}
      className={cn(
        "absolute bottom-1 top-1 cursor-grab overflow-hidden rounded-md text-[11px] text-foreground active:cursor-grabbing",
        clipColor[clip.kind],
        selected
          ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
          : multiSelected
            ? "ring-2 ring-primary/60 ring-offset-1 ring-offset-background brightness-110"
            : "ring-1 ring-background/40",
        dim && "opacity-40",
      )}
      style={{ left: displayLeft ?? clip.start * pps, width: w }}
      onPointerDown={(e) => {
        rest.onPointerDown?.(e as React.PointerEvent<HTMLDivElement>);
        onDown(e, "move");
      }}
    >
      <div className="flex h-full items-start gap-1 px-2 py-1">
        <span className="truncate font-medium drop-shadow">
          {clip.kind === "text" ? clip.text?.content : clip.name}
        </span>
        {clip.speedCurve ? (
          <span className="rounded bg-background/60 px-1 font-mono">curve</span>
        ) : (
          clip.speed !== 1 && (
            <span className="rounded bg-background/60 px-1 font-mono">{clip.speed}x</span>
          )
        )}
        {clip.kind !== "effect" && clip.kind !== "filter" && (clip.filter || clip.fx?.length) && (
          <span className="rounded bg-background/60 px-1 font-mono">fx</span>
        )}
      </div>
      {clip.transitionOut && (
        <div
          className="absolute bottom-0 right-0 top-0 bg-background/30"
          style={{ width: clip.transitionOut.duration * pps }}
        />
      )}
      {clip.kind === "audio" && <AudioClipVolume clip={clip} store={store} locked={locked} />}
      {[...kfTimes].map((t) => (
        <div
          key={t}
          className="absolute bottom-1 h-2 w-2 -translate-x-1 rotate-45 bg-foreground"
          style={{ left: t * pps }}
        />
      ))}
      <div
        className="absolute bottom-0 left-0 top-0 z-10 w-3 cursor-ew-resize bg-foreground/0 hover:bg-foreground/40"
        data-trim-edge="l"
        onPointerDown={(e) => onDown(e, "l")}
      />
      <div
        className="absolute bottom-0 right-0 top-0 z-10 w-3 cursor-ew-resize bg-foreground/0 hover:bg-foreground/40"
        data-trim-edge="r"
        onPointerDown={(e) => onDown(e, "r")}
      />
    </div>
  );
}

/**
 * A transition as the timeline object it is: its own inline block in the lane gap between two
 * display-shortened clips, positioned at the blend span. It is not part of either clip rectangle,
 * so selecting, stretching, squeezing or deleting it never changes a clip's data - only its visual
 * width changes to accommodate the blend.
 */
function TransitionBlock({
  clip,
  prev,
  pps,
  store,
  track,
  hovering,
  drag,
  ...rest
}: {
  clip: Clip;
  prev: Clip | null;
  pps: number;
  store: EditorStore;
  track: Track;
  hovering: boolean;
  drag: DragCtx;
} & React.ComponentProps<"div">) {
  const selected = useEditor(store, (s) => s.selectedTransitionOf === clip.id);
  const span = transitionBlockSpan(clip);
  const trans = clip.transitionIn;
  if (!span || !trans) return null;
  const maxDur = maxTransitionDuration(prev, clip);
  // a blend shorter than a few pixels still has to be clickable
  const w = Math.max(span.duration * pps, MIN_TRANS_W);
  // straddle the joint (or wherever its saved bias aims it), so it belongs to neither clip
  const left = Math.max(0, span.center * pps - w / 2);
  const name = transitionName(trans.type);

  // The block is described by a duration and a bias - how far its centre sits from the cut - but
  // every edit works on its two edges directly. A trimmed edge clamps only against the material on
  // its own side (the two clips that shorten to make room) and against the block's length limits,
  // so the pinned edge can never jump: trimming one side simply stops when it runs out of room.
  const minL = prev ? prev.start : 0;
  const maxR = clipEnd(clip);
  const applyShape = (rawL: number, rawR: number, dragged: "l" | "r" | "c") => {
    let dur = Math.max(0.1, Math.min(maxDur, rawR - rawL));
    let l: number;
    let r: number;
    if (dragged === "l") {
      // the right edge holds still, and the block can't reach before the material on the left does
      r = Math.min(maxR, Math.max(rawR, minL + 0.1));
      dur = Math.min(dur, r - minL);
      l = r - dur;
    } else if (dragged === "r") {
      l = Math.max(minL, Math.min(rawL, maxR - 0.1));
      dur = Math.min(dur, maxR - l);
      r = l + dur;
    } else {
      // a symmetric edit keeps its centre, which slides so the block stays inside the material
      dur = Math.min(dur, maxR - minL);
      const c = Math.max(minL + dur / 2, Math.min(maxR - dur / 2, (rawL + rawR) / 2));
      l = c - dur / 2;
      r = c + dur / 2;
    }
    const bias = (l + r) / 2 - clip.start;
    store.updateClip(clip.id, (c) => ({
      ...c,
      transitionIn: c.transitionIn ? { ...c.transitionIn, duration: dur, bias } : undefined,
    }));
  };

  // Each edge moves on its own: the edge you grab follows the pointer and the opposite edge holds
  // still, so a left drag never drags the right end with it. The cut itself stays put, so neither
  // clip loses a frame. The delta is scrolled timeline time, so a long blend keeps growing as the
  // lane pans under the pointer.
  const startTrimDrag = (side: "l" | "r") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    selectTransition(store, clip.id);
    if (track.locked) return;
    store.beginGesture();
    const ctrl = drag.open();
    const startTime = drag.timeAt(e.clientX);
    const origDur = trans.duration;
    const origBias = trans.bias ?? 0;
    const leftEdge = clip.start + origBias - origDur / 2;
    const rightEdge = clip.start + origBias + origDur / 2;
    const move = (ev: PointerEvent) => {
      ctrl.track(ev.clientX);
      const dx = drag.timeAt(ev.clientX) - startTime;
      // the grabbed edge follows the pointer, the opposite edge never moves
      if (side === "r") applyShape(leftEdge, rightEdge + dx, "r");
      else applyShape(leftEdge + dx, rightEdge, "l");
    };
    const up = () => {
      ctrl.close();
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    ctrl.track(e.clientX);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      // the blend is a menu target of its own, so the trigger props have to reach this element
      {...rest}
      data-transition-for={clip.id}
      role="button"
      tabIndex={0}
      aria-label={`${name} transition, ${trans.duration.toFixed(2)} seconds`}
      title={`${name} · ${trans.duration.toFixed(2)}s - sits on the cut between the clips; trim either end on its own, arrows to nudge, Del to remove`}
      className={cn(
        "absolute bottom-1 top-1 flex select-none items-center overflow-hidden rounded-md border text-[9px] font-bold",
        selected
          ? "border-primary bg-primary/25 text-primary ring-1 ring-primary/60"
          : hovering
            ? "border-dashed border-primary bg-card text-primary"
            : "border-border bg-card text-foreground/80 hover:border-primary/60 hover:text-primary",
      )}
      style={{ left, width: w }}
      onPointerDown={(e) => {
        // the body only aims the blend (and opens its menu via the trigger props); the handles trim
        rest.onPointerDown?.(e as React.PointerEvent<HTMLDivElement>);
        if (e.button !== 0) return;
        // the block sits over the cut, so the lane's own pointerdown would still see it as an empty
        // click and wipe the selection we are about to make - stop that before it can bubble.
        e.stopPropagation();
        selectTransition(store, clip.id);
      }}
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
        // arrows resize symmetrically around the block's own centre
        applyShape(
          span.center - trans.duration / 2 + step,
          span.center + trans.duration / 2 - step,
          "c",
        );
      }}
    >
      {/* the block is its own object, not a piece of video: it never carries a clip colour */}
      <span className="relative min-w-0 flex-1 truncate pl-1.5">{name}</span>
      {w >= 68 && (
        <span className="relative shrink-0 font-mono tabular-nums opacity-70">
          {trans.duration.toFixed(2)}s
        </span>
      )}
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
