import { editCue } from "./caption-edit";
import {
  addClipToTimeline,
  resolveLaneIndex,
  seamTargetAt,
  selectTransition,
  trackKindFor,
} from "./placement";
import type { EditorStore } from "./store";
import { maxTransitionDuration, prevAdjacent, transitionName } from "./transitions";
import {
  type CaptionCue,
  type CaptionTrack,
  type Clip,
  type Track,
  type Transition,
  clipDuration,
  uid,
} from "./types";

/**
 * One timeline object held whole so it can be put down again somewhere else: a clip of any kind
 * (media, audio, text, sticker, effect or grade block), a transition on its own, or a caption cue.
 * It travels on the editor store rather than the browser clipboard because a timeline object is not
 * text - and a media clip only means something inside the project that owns its asset.
 */
export type ClipboardItem =
  | { type: "clip"; clip: Clip; trackId: string }
  | { type: "transition"; transition: Transition }
  | { type: "cue"; cue: CaptionCue; trackId: string };

/** What the paste needs for caption tracks, which live outside the timeline JSON. */
export interface CaptionContext {
  tracks: readonly CaptionTrack[];
  update: (id: string, fn: (t: CaptionTrack) => CaptionTrack) => void;
}

export type PasteResult =
  | { ok: true; kind: "clip"; id: string; start: number; trackId: string | null }
  | { ok: true; kind: "transition"; id: string; clamped: boolean }
  | { ok: true; kind: "cue"; id: string; trackId: string }
  | { ok: false; reason: "empty" | "no-seam" | "no-track" };

type Span = { start: number; end: number };

/**
 * A paste never lands on top of what is already there, so the span walks forward past each
 * blocker until it is clear. Repeated pastes therefore chain instead of stacking at one instant,
 * and nothing already edited is moved to make room.
 */
function firstFreeStart(spans: Span[], from: number, dur: number): number {
  let start = Math.max(0, from);
  for (let guard = 0; guard < 500; guard++) {
    const blocker = spans.find((s) => s.start < start + dur && s.end > start);
    if (!blocker) break;
    start = Math.max(start, blocker.end);
  }
  return start;
}

/** Held as its own deep copy: editing the original afterwards must not rewrite the clipboard. */
const snapshot = <T>(value: T): T => structuredClone(value);

/** The cue under a moment in time, on the first track that holds one there. */
function cueAt(
  captions: readonly CaptionTrack[],
  time: number,
): { cue: CaptionCue; trackId: string } | null {
  for (const track of captions) {
    const cue = track.cues.find((c) => time >= c.start && time < c.end);
    if (cue) return { cue, trackId: track.id };
  }
  return null;
}

/**
 * Whatever block covers a moment, reading the lane stack from the top down. Unlike the clips that
 * paint a frame, this answers for every kind - an audio hit, an effect block and a grade are all
 * objects worth reusing, so Copy works on a bare seek and not only after a click.
 */
function clipAt(tracks: readonly Track[], time: number): { track: Track; clip: Clip } | null {
  for (const track of tracks) {
    if (track.locked) continue;
    const clip = track.clips.find((c) => time >= c.start && time < c.start + clipDuration(c));
    if (clip) return { track, clip };
  }
  return null;
}

/**
 * What a copy would take: the object the user pointed at, and otherwise whatever sits under the
 * playhead - so Copy works after a click on a clip, a transition block or a caption cue without
 * asking them to select anything first. A selected transition wins over its own clip, matching
 * what Del already removes.
 */
export function copyTarget(
  store: EditorStore,
  captions: readonly CaptionTrack[],
): ClipboardItem | null {
  const state = store.get();
  const time = state.time;

  const cueId = state.selectedCueId;
  if (cueId) {
    for (const track of captions) {
      const cue = track.cues.find((c) => c.id === cueId);
      if (cue) return { type: "cue", cue: snapshot(cue), trackId: track.id };
    }
  }

  const hit = store.findClip(state.selectedClipId);
  if (hit) {
    if (state.selectedTransitionOf === hit.clip.id && hit.clip.transitionIn)
      return { type: "transition", transition: snapshot(hit.clip.transitionIn) };
    return { type: "clip", clip: snapshot(hit.clip), trackId: hit.track.id };
  }

  const under = clipAt(state.timeline.tracks, time);
  if (under) return { type: "clip", clip: snapshot(under.clip), trackId: under.track.id };

  const cue = cueAt(captions, time);
  if (cue) return { type: "cue", cue: snapshot(cue.cue), trackId: cue.trackId };

  return null;
}

/** Copy the current target onto the store, so the paste button and the tooltip know what is held. */
export function copySelection(
  store: EditorStore,
  captions: readonly CaptionTrack[],
): ClipboardItem | null {
  const item = copyTarget(store, captions);
  store.set({ clipboard: item });
  return item;
}

/** Name worth showing in a toast or a tooltip, taken from the held object itself. */
export function clipboardLabel(item: ClipboardItem): string {
  if (item.type === "transition") return `${transitionName(item.transition.type)} transition`;
  if (item.type === "cue")
    return item.cue.text ? `Caption "${truncated(item.cue.text)}"` : "Caption";
  const clip = item.clip;
  if (clip.kind === "text") return `Text "${truncated(clip.text?.content ?? "")}"`;
  if (clip.kind === "shape") return clip.name || "Sticker";
  if (clip.kind === "effect") return `Effect ${clip.name}`;
  if (clip.kind === "filter") return `Filter ${clip.name}`;
  return clip.name || `${clip.kind} clip`;
}

const truncated = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text);

/**
 * The seam a paste should blend: the joint at the playhead, or the in-seam of the clip under it,
 * then the selected clip's own joint as a last aim. Everything is a real seam only when a clip
 * precedes the target on its lane.
 */
function pasteSeam(store: EditorStore): { trackId: string; clip: Clip } | null {
  const state = store.get();
  const tol = 8 / state.pxPerSec;
  const at = seamTargetAt(state.timeline.tracks, state.time, tol);
  if (at) return { trackId: at.track.id, clip: at.clip };
  const selected = store.findClip(state.selectedClipId);
  if (selected) {
    const track = state.timeline.tracks.find((tr) => tr.id === selected.track.id);
    if (track && !track.locked && prevAdjacent(track, selected.clip))
      return { trackId: track.id, clip: selected.clip };
  }
  return null;
}

/**
 * Put the held object down again at the playhead, on the lane it came from when that lane can still
 * take it. An effect, grade, text or sticker keeps its own look, transform and keyframes; the one
 * thing a copied clip loses is its in-transition, because a blend belongs to a joint and pasting a
 * lone clip would point it at nothing - copy the transition itself to place one on another seam.
 */
export function pasteClipboard(store: EditorStore, captions: CaptionContext): PasteResult {
  const item = store.get().clipboard;
  if (!item) return { ok: false, reason: "empty" };

  if (item.type === "clip") {
    const tracks = store.get().timeline.tracks;
    // the lane the copy will actually land on, which is not the source lane once that row is
    // locked - and the free moment is measured on the lane that receives it, not on any other
    const laneIndex = resolveLaneIndex(
      tracks,
      trackKindFor(item.clip.kind),
      item.clip.kind,
      item.trackId,
    );
    const lane = laneIndex >= 0 ? (tracks[laneIndex] ?? null) : null;
    const spans = lane
      ? lane.clips.map((c) => ({ start: c.start, end: c.start + clipDuration(c) }))
      : [];
    const dur = clipDuration(item.clip);
    const start = firstFreeStart(spans, store.get().time, dur);
    const copy: Clip = { ...snapshot(item.clip), id: uid(), start, transitionIn: undefined };
    addClipToTimeline(store, copy, item.trackId);
    return { ok: true, kind: "clip", id: copy.id, start, trackId: lane?.id ?? null };
  }

  if (item.type === "transition") {
    const target = pasteSeam(store);
    if (!target) return { ok: false, reason: "no-seam" };
    const track = store.get().timeline.tracks.find((tr) => tr.id === target.trackId);
    const prev = track ? prevAdjacent(track, target.clip) : null;
    if (!track || !prev) return { ok: false, reason: "no-seam" };
    // a blend can be no longer than the joint allows: the paste keeps the copied effect and trims
    // its length to fit, so a long dissolve reuses onto short shots instead of being refused
    const max = maxTransitionDuration(prev, target.clip);
    const duration = Math.max(0.1, Math.min(item.transition.duration, max));
    const type = item.transition.type;
    store.updateClip(target.clip.id, (c) => ({ ...c, transitionIn: { type, duration } }));
    selectTransition(store, target.clip.id);
    return {
      ok: true,
      kind: "transition",
      id: target.clip.id,
      clamped: duration < item.transition.duration,
    };
  }

  const held = item.cue;
  const track = captions.tracks.find((t) => t.id === item.trackId) ?? captions.tracks[0];
  if (!track) return { ok: false, reason: "no-track" };
  const dur = Math.max(0.1, held.end - held.start);
  const start = firstFreeStart(
    track.cues.map((c) => ({ start: c.start, end: c.end })),
    store.get().time,
    dur,
  );
  const cue = editCue({ id: uid(), start, end: start + dur, text: held.text }, {});
  captions.update(track.id, (t) => ({
    ...t,
    cues: [...t.cues, cue].sort((a, b) => a.start - b.start),
  }));
  store.set({ selectedClipId: null, selectedCueId: cue.id, playing: false, time: cue.start });
  return { ok: true, kind: "cue", id: cue.id, trackId: track.id };
}
