import type { EditorStore } from './store';
import { prevAdjacent, transitionInSpan } from './transitions';
import {
  type Clip,
  type Track,
  type TrackKind,
  clipDuration,
  clipEnd,
  isVisualClip,
  newTrack,
} from './types';

/** Prefer the selected visual clip, then the visible media under the playhead. */
export function presetTarget(store: EditorStore) {
  const state = store.get();
  const selected = store.findClip(state.selectedClipId);
  if (selected && !selected.track.hidden && !selected.track.locked && selected.clip.kind !== 'audio') return selected;
  for (const track of state.timeline.tracks) {
    if (track.hidden || track.locked || track.kind === 'audio') continue;
    const clip = track.clips.find(c => (c.kind === 'video' || c.kind === 'image') && state.time >= c.start && state.time < clipEnd(c));
    if (clip) return { track, clip };
  }
  return null;
}

export function visiblePresetTime(store: EditorStore): number {
  const time = store.get().time;
  const target = presetTarget(store);
  if (!target) return time;
  const c = target.clip;
  return time >= c.start && time < clipEnd(c) ? time : c.start + Math.min(0.25, clipDuration(c) / 2);
}

/**
 * Which lane kind a block of clip kind may sit on. Every kind keeps its own line: media and audio
 * stay in rows of their type, text and stickers in a text row, an effect block in an Effects row
 * and a grade block in a Filters row. Rendering still decides by the clip's own kind, so a block
 * left in an odd lane by an older project keeps working - it just cannot be placed there again.
 */
export function accepts(track: TrackKind, clip: Clip['kind']): boolean {
  if (clip === 'effect') return track === 'effect';
  if (clip === 'filter') return track === 'filter';
  if (track === 'video') return clip === 'video' || clip === 'image';
  if (track === 'audio') return clip === 'audio';
  if (track === 'text') return clip === 'text' || clip === 'shape';
  return false;
}

export function trackKindFor(clip: Clip['kind']): TrackKind {
  if (clip === 'audio') return 'audio';
  if (clip === 'text' || clip === 'shape') return 'text';
  if (clip === 'effect') return 'effect';
  if (clip === 'filter') return 'filter';
  return 'video';
}

/**
 * Blocks that paint over the picture rather than being part of it: they never join the row they
 * were dropped on, they get a lane of their own directly above it, so the timeline reads as
 * separate lines the way the layers actually stack.
 */
function overlayKindFor(clip: Clip['kind']): TrackKind | null {
  return clip === 'effect' ? 'effect' : clip === 'filter' ? 'filter' : null;
}

/** True for the blocks that belong above the material they change, incl. text and stickers. */
function floatsAboveRow(clip: Clip['kind']): boolean {
  return overlayKindFor(clip) !== null || clip === 'text' || clip === 'shape';
}

/** Insert a clip into the lane it belongs on, creating one if needed. */
export function addClipToTimeline(store: EditorStore, clip: Clip, preferTrackId?: string) {
  store.update((t) => {
    const tracks = [...t.tracks];
    const preferred = tracks.find((tr) => tr.id === preferTrackId);
    const kind = trackKindFor(clip.kind);
    const aim = preferred ? tracks.indexOf(preferred) : -1;
    // the row under the cursor is honoured only when it is this block's own kind
    let idx = preferred && !preferred.locked && preferred.kind === kind ? aim : -1;
    if (idx < 0 && !floatsAboveRow(clip.kind))
      // media and audio are indifferent to layer order: the first free row of the type will do
      idx = tracks.findIndex((tr) => !tr.locked && tr.kind === kind);
    if (idx < 0 && floatsAboveRow(clip.kind)) {
      if (aim < 0)
        // a gallery click aims at no row, so it reuses the line that already holds blocks of this
        // kind instead of stacking another one on top of the stack
        idx = tracks.findIndex((tr) => !tr.locked && tr.kind === kind);
      // otherwise the nearest lane of that kind at or above the dropped-on row: one line gathers
      // its blocks instead of a new lane appearing per drop, and nothing sinks below its picture
      else
        for (let i = aim; i >= 0; i--) {
          const tr = tracks[i];
          if (tr && !tr.locked && tr.kind === kind) {
            idx = i;
            break;
          }
        }
    }
    if (idx < 0) {
      const n = tracks.filter((tr) => tr.kind === kind).length + 1;
      const tr = newTrack(kind, n);
      if (kind === 'audio') {
        tracks.push(tr);
        idx = tracks.length - 1;
      } else {
        // directly above the row it was dropped on, or on top of the stack when there is none
        idx = aim < 0 ? 0 : Math.max(0, aim);
        tracks.splice(idx, 0, tr);
      }
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
    inspectorTab: clip.kind === 'text' ? 'text' : clip.kind === 'shape' ? 'shape' : clip.kind === 'effect' ? 'effect' : clip.kind === 'filter' ? 'filters' : 'basic',
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
    inspectorTab: 'trans',
    playing: false,
    time: span ? span.start + Math.min(0.2, span.duration / 2) : store.get().time,
  });
}

/** Drop the clip's in-transition, keeping the clip and its position. */
export function removeTransition(store: EditorStore, clipId: string) {
  store.updateClip(clipId, (c) => ({ ...c, transitionIn: undefined }));
  store.set({ selectedClipId: clipId, selectedTransitionOf: null, inspectorTab: 'trans' });
}

/** The visual clip on a lane that covers `time`; overlays win over the lane below them. */
export function clipCoveringAt(tracks: Track[], time: number, preferTrackId?: string): { track: Track; clip: Clip } | null {
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
export function seamTargetAt(tracks: Track[], time: number, tol: number, preferTrackId?: string): { track: Track; clip: Clip } | null {
  const lane = tracks.find((tr) => tr.id === preferTrackId);
  const pools = lane && !lane.locked ? [lane, ...tracks.filter((tr) => tr !== lane)] : tracks;
  for (const tr of pools) {
    if (tr.locked || tr.hidden) continue;
    const atSeam = tr.clips.find((c) => isVisualClip(c) && Math.abs(c.start - time) <= tol && prevAdjacent(tr, c));
    if (atSeam) return { track: tr, clip: atSeam };
  }
  for (const tr of pools) {
    if (tr.locked || tr.hidden) continue;
    const inside = tr.clips.find((c) => isVisualClip(c) && time >= c.start && time < clipEnd(c));
    if (inside && prevAdjacent(tr, inside)) return { track: tr, clip: inside };
  }
  return null;
}
