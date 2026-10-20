import type { EditorStore } from './store';
import { clipDuration, clipEnd } from './types';

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