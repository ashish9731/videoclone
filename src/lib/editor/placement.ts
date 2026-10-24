import type { EditorStore } from "./store";
import { prevAdjacent, transitionInSpan } from "./transitions";
import {
  type Clip,
  type Track,
  type TrackKind,
  clipDuration,
  clipEnd,
  isVisualClip,
  newTrack,
} from "./types";

/** Prefer the selected visual clip, then the visible media under the playhead. */
export function presetTarget(store: EditorStore) {
  const state = store.get();
  const selected = store.findClip(state.selectedClipId);
  if (
    selected &&
    !selected.track.hidden &&
    !selected.track.locked &&
    selected.clip.kind !== "audio"
  )
    return selected;
  for (const track of state.timeline.tracks) {
    if (track.hidden || track.locked || track.kind === "audio") continue;
    const clip = track.clips.find(
      (c) =>
        (c.kind === "video" || c.kind === "image") &&
        state.time >= c.start &&
        state.time < clipEnd(c),
    );
    if (clip) return { track, clip };
  }
  return null;
}

export function visiblePresetTime(store: EditorStore): number {
  const time = store.get().time;
  const target = presetTarget(store);
  if (!target) return time;
  const c = target.clip;
  return time >= c.start && time < clipEnd(c)
    ? time
    : c.start + Math.min(0.25, clipDuration(c) / 2);
}

/**
 * Which lane kind a block of clip kind may sit on. Every kind keeps its own line: media and audio
 * stay in rows of their type, text and stickers in a text row, an effect block in an Effects row
 * and a grade block in a Filters row. Rendering still decides by the clip's own kind, so a block
 * left in an odd lane by an older project keeps working - it just cannot be placed there again.
 */
export function accepts(track: TrackKind, clip: Clip["kind"]): boolean {
  if (clip === "effect") return track === "effect";
  if (clip === "filter") return track === "filter";
  if (track === "video") return clip === "video" || clip === "image";
  if (track === "audio") return clip === "audio";
  if (track === "text") return clip === "text" || clip === "shape";
  return false;
}

export function trackKindFor(clip: Clip["kind"]): TrackKind {
  if (clip === "audio") return "audio";
  if (clip === "text" || clip === "shape") return "text";
  if (clip === "effect") return "effect";
  if (clip === "filter") return "filter";
  return "video";
}

/**
 * Blocks that paint over the picture rather than being part of it: they never join the row they
 * were dropped on, they get a lane of their own directly above it, so the timeline reads as
 * separate lines the way the layers actually stack.
 */
function overlayKindFor(clip: Clip["kind"]): TrackKind | null {
  return clip === "effect" ? "effect" : clip === "filter" ? "filter" : null;
}

/** True for the blocks that belong above the material they change, incl. text and stickers. */
function floatsAboveRow(clip: Clip["kind"]): boolean {
  return overlayKindFor(clip) !== null || clip === "text" || clip === "shape";
}

/**
 * Which lane receives a block: the row it was aimed at when that row is already the right kind,
 * otherwise the first unlocked row of the kind. Blocks that float gather at the topmost matching
 * row at or above the aimed one, so a lane keeps its overlays instead of getting a new lane per
 * drop, while media is indifferent to layer order. `-1` means no row fits and one must be created.
 */
export function resolveLaneIndex(
  tracks: readonly Track[],
  kind: TrackKind,
  clip: Clip["kind"],
  preferTrackId?: string,
): number {
  const usable = (i: number) => {
    const tr = tracks[i];
    return !!tr && !tr.locked && tr.kind === kind;
  };
  const aim = tracks.findIndex((tr) => tr.id === preferTrackId);
  if (aim >= 0 && usable(aim)) return aim;
  if (!floatsAboveRow(clip)) return tracks.findIndex((_, i) => usable(i));
  // a gallery click aims at no row, so it reuses the line that already holds blocks of this kind
  if (aim < 0) return tracks.findIndex((_, i) => usable(i));
  for (let i = aim; i >= 0; i--) if (usable(i)) return i;
  return -1;
}

/**
 * True when a clip spanning [start, end) would temporally overlap any clip already on the track.
 * Used to prevent placing two clips on the same lane at the same time position.
 */
function wouldOverlap(clips: readonly Clip[], start: number, end: number): boolean {
  return clips.some((c) => {
    const cEnd = clipEnd(c);
    return start < cEnd && end > c.start;
  });
}

/**
 * Find the first lane of `kind` that is usable AND does not overlap the new clip's time range.
 * Falls back to -1 when every matching lane would cause overlap, signalling that a new one
 * must be created. This guarantees that adding a clip never overlays existing material.
 * For overlay kinds (effect, filter, text, shape) temporal stacking is allowed, so overlap
 * checking is skipped: they always reuse the first usable lane.
 */
function resolveNonOverlappingLane(
  tracks: readonly Track[],
  kind: TrackKind,
  clip: Clip,
  preferTrackId?: string,
): number {
  // Overlay clips composite freely on the same lane; use the original resolveLaneIndex
  if (floatsAboveRow(clip.kind)) return resolveLaneIndex(tracks, kind, clip.kind, preferTrackId);
  // Content clips (video, image, audio) must not temporally overlap on the same lane
  const clipEnd_ = clipEnd(clip);
  const usable = (i: number) => {
    const tr = tracks[i];
    return !!tr && !tr.locked && tr.kind === kind;
  };
  // if the aimed lane is usable and doesn't overlap, use it directly
  const aim = tracks.findIndex((tr) => tr.id === preferTrackId);
  if (aim >= 0 && usable(aim) && !wouldOverlap(tracks[aim]!.clips, clip.start, clipEnd_))
    return aim;
  // scan all usable lanes of this kind for one without overlap
  for (let i = 0; i < tracks.length; i++) {
    if (usable(i) && !wouldOverlap(tracks[i]!.clips, clip.start, clipEnd_)) return i;
  }
  // all lanes of this kind would cause overlap: signal that a new one is needed
  return -1;
}

/** Insert a clip into the lane it belongs on, creating one if needed. Never overlays existing clips. */
export function addClipToTimeline(store: EditorStore, clip: Clip, preferTrackId?: string) {
  store.update((t) => {
    const tracks = [...t.tracks];
    const kind = trackKindFor(clip.kind);
    const aim = tracks.findIndex((tr) => tr.id === preferTrackId);
    // find a non-overlapping lane; if all would overlap, create a new one
    const idx = resolveNonOverlappingLane(tracks, kind, clip, preferTrackId);
    if (idx < 0) {
      const n = tracks.filter((tr) => tr.kind === kind).length + 1;
      const tr = newTrack(kind, n);
      if (kind === "audio")
        // audio always joins the bottom of the stack, so the new row goes last
        return { tracks: [...tracks, { ...tr, clips: [clip] }] };
      // directly above the row it was dropped on, or on top of the stack when there is none
      const at = Math.max(0, aim);
      tracks.splice(at, 0, { ...tr, clips: [clip] });
      return { tracks };
    }
    const target = tracks[idx];
    if (!target) return t;
    tracks[idx] = { ...target, clips: [...target.clips, clip] };
    return { tracks };
  });
  // Stop at a visible point after entrance animations; never leave the playhead
  // at a clip's exclusive end or behind the newly inserted overlay.
  store.set({
    selectedClipId: clip.id,
    playing: false,
    time: clip.start + Math.min(0.25, clipDuration(clip) / 2),
    inspectorTab:
      clip.kind === "text"
        ? "text"
        : clip.kind === "shape"
          ? "shape"
          : clip.kind === "effect"
            ? "effect"
            : clip.kind === "filter"
              ? "filters"
              : "basic",
  });
}

/**
 * A transition block is an object of its own: selecting it must not select the clip it belongs to
 * for deletion, so the selection records both ids and the playhead lands inside the blend window
 * the transition owns - that is the frame the user is editing.
 */
export function selectTransition(store: EditorStore, clipId: string) {
  const hit = store.findClip(clipId);
  const span = hit ? transitionInSpan(hit.clip) : null;
  store.set({
    selectedClipId: clipId,
    selectedTransitionOf: clipId,
    inspectorTab: "trans",
    playing: false,
    time: span ? span.start + Math.min(0.2, span.duration / 2) : store.get().time,
  });
}

/** Drop the clip's in-transition, keeping the clip and its position. */
export function removeTransition(store: EditorStore, clipId: string) {
  store.updateClip(clipId, (c) => ({ ...c, transitionIn: undefined }));
  store.set({ selectedClipId: clipId, selectedTransitionOf: null, inspectorTab: "trans" });
}

/** The visual clip on a lane that covers `time`; overlays win over the lane below them. */
export function clipCoveringAt(
  tracks: Track[],
  time: number,
  preferTrackId?: string,
): { track: Track; clip: Clip } | null {
  const lane = tracks.find((tr) => tr.id === preferTrackId);
  const pools = lane && !lane.locked ? [lane, ...tracks.filter((tr) => tr !== lane)] : tracks;
  for (const tr of pools) {
    if (tr.locked || tr.hidden) continue;
    const clip = tr.clips.find((c) => isVisualClip(c) && time >= c.start && time < clipEnd(c));
    if (clip) return { track: tr, clip };
  }
  return null;
}

/**
 * A transition needs two touching clips, so a drop counts as a seam only when a clip starts
 * there (within `tol` seconds, the snap distance) with material directly before it. Falls back
 * to the clip covering the drop point, whose in-seam is the boundary the user is aiming at.
 */
export function seamTargetAt(
  tracks: Track[],
  time: number,
  tol: number,
  preferTrackId?: string,
): { track: Track; clip: Clip } | null {
  const lane = tracks.find((tr) => tr.id === preferTrackId);
  const pools = lane && !lane.locked ? [lane, ...tracks.filter((tr) => tr !== lane)] : tracks;
  for (const tr of pools) {
    if (tr.locked || tr.hidden) continue;
    const atSeam = tr.clips.find(
      (c) => isVisualClip(c) && Math.abs(c.start - time) <= tol && prevAdjacent(tr, c),
    );
    if (atSeam) return { track: tr, clip: atSeam };
  }
  for (const tr of pools) {
    if (tr.locked || tr.hidden) continue;
    const inside = tr.clips.find((c) => isVisualClip(c) && time >= c.start && time < clipEnd(c));
    if (inside && prevAdjacent(tr, inside)) return { track: tr, clip: inside };
  }
  return null;
}
