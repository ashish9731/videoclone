import { toast } from 'sonner';
import { EFFECTS, FILTERS } from '@/lib/editor/fx';
import { TRANSITIONS, maxTransitionDuration, nextAdjacent, prevAdjacent } from '@/lib/editor/transitions';
import { TEXT_TEMPLATES, clipFromTemplate, shapeClip } from '@/lib/editor/presets';
import { SHAPES } from '@/lib/editor/shapes';
import { ART_STICKERS } from '@/lib/editor/stickers';
import { addClipToTimeline, clipCoveringAt, presetTarget, seamTargetAt, selectTransition } from '@/lib/editor/placement';
import { type Clip, clipDuration, effectClip, filterClip } from '@/lib/editor/types';
import { announcePro, isProPreset } from '@/lib/pro-gate';
import type { EditorStore } from '@/lib/editor/store';

export const ASSET_MIME = 'application/x-cutroom-asset';
/** Library tiles travel as `preset:<tab>:<id>`; sticker ids contain colons, so the tab is the first field. */
export const PRESET_PREFIX = 'preset:';

// True between dragstart and dragend of an internal drag. Engines differ
// in whether custom dataTransfer types appear in dragover `types` (Safari can
// drop them entirely), so the flag is the belt-and-braces gate for lanes.
let dragActive = false;
/**
 * The preset being dragged, when there is one. `dataTransfer` payloads are unreadable during
 * `dragover` (only `types` is exposed), so the timeline asks this instead to preview the seam a
 * transition is about to land on.
 */
let activePreset: { tab: string; id: string } | null = null;
export function beginAssetDrag() {
  dragActive = true;
}
export function endAssetDrag() {
  dragActive = false;
  activePreset = null;
}
export const activeDragPreset = () => activePreset;

export const hasAssetPayload = (e: { dataTransfer: DataTransfer }) =>
  dragActive || e.dataTransfer.types.some((t) => t.toLowerCase() === ASSET_MIME);

/** Data written by a media drag: the custom MIME first, text/plain for engines
 *  that only propagate standard formats. */
export function writeAssetDrag(e: { dataTransfer: DataTransfer }, id: string) {
  e.dataTransfer.setData(ASSET_MIME, id);
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'copy';
  beginAssetDrag();
}

/** Same belt-and-braces payload for a library preset, tagged so the drop can tell
 *  an asset id from a catalog entry. */
export function writePresetDrag(e: { dataTransfer: DataTransfer }, tab: string, id: string) {
  activePreset = { tab, id };
  writeAssetDrag(e, `${PRESET_PREFIX}${tab}:${id}`);
}

export function parsePresetPayload(raw: string): { tab: string; id: string } | null {
  if (!raw.startsWith(PRESET_PREFIX)) return null;
  const rest = raw.slice(PRESET_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { tab: rest.slice(0, sep), id: rest.slice(sep + 1) };
}

export type DropOptions = { time: number; trackId?: string | undefined; pxPerSec: number; width: number; height: number };

/** The clip the drop is aiming at, falling back to what the playhead is showing. */
function targetClip(store: EditorStore, o: DropOptions) {
  const tracks = store.get().timeline.tracks;
  return clipCoveringAt(tracks, o.time, o.trackId) ?? presetTarget(store);
}

/**
 * Place a library preset at a chosen moment and lane. This is the single implementation
 * behind both the gallery "+" button and dragging a tile onto the timeline, so click and
 * drop can never drift apart. Each kind lands on its own line: an effect block and a grade
 * block get a lane above the row they were dropped on, a transition attaches to the seam
 * under the cursor.
 */
export function applyPresetAt(store: EditorStore, tab: string, id: string, o: DropOptions): boolean {
  // one gate for both routes into the timeline - the gallery "+" and a tile drop - so a locked
  // feature cannot be added by either and the user always gets the same "coming soon" answer
  if (isProPreset(tab, id)) {
    announcePro('aiPortrait');
    return false;
  }
  const time = Math.max(0, o.time);
  if (tab === 'Effects') {
    const def = EFFECTS.find((e) => e.id === id);
    if (!def) return false;
    const at = targetClip(store, o);
    const dur = at ? clipDuration(at.clip) : 3;
    addClipToTimeline(store, effectClip(def.id, def.name, time, dur), o.trackId);
    return true;
  }
  if (tab === 'Transitions') {
    const def = TRANSITIONS.find((t) => t.id === id);
    if (!def) return false;
    const tracks = store.get().timeline.tracks;
    // a transition still blends two touching clips, but they may touch on any lane
    const tol = 8 / Math.max(1, o.pxPerSec);
    const seam = seamTargetAt(tracks, time, tol, o.trackId);
    let clip: Clip | undefined;
    if (seam) clip = seam.clip;
    else {
      const at = targetClip(store, o);
      // the clip under the cursor already reads as visual, so the lane it sits on is irrelevant
      if (at && !at.track.locked && prevAdjacent(at.track, at.clip)) clip = at.clip;
      else if (at) {
        const next = nextAdjacent(at.track, at.clip);
        if (next) clip = next;
      }
    }
    if (!clip) {
      toast.error('Drop it on the joint between two touching clips.');
      return false;
    }
    const target = clip;
    const at = store.findClip(target.id);
    const prev = at ? prevAdjacent(at.track, target) : null;
    store.updateClip(target.id, (c) => ({
      ...c,
      transitionIn: { type: def.id, duration: c.transitionIn?.duration ?? Math.min(0.8, maxTransitionDuration(prev, c)) },
    }));
    // the thing that was just placed is the transition, so select it as one and show its blend
    selectTransition(store, target.id);
    return true;
  }
  if (tab === 'Filters') {
    const def = FILTERS.find((f) => f.id === id);
    if (!def) return false;
    const at = targetClip(store, o);
    const dur = at ? clipDuration(at.clip) : 3;
    // a filter is a block of its own on a Filters lane: it grades the picture for exactly its
    // own span instead of being painted onto whichever clip happens to be underneath
    addClipToTimeline(store, filterClip(def.id, def.name, time, dur), o.trackId);
    return true;
  }
  if (tab === 'Text') {
    const def = TEXT_TEMPLATES.find((t) => t.id === id);
    if (!def) return false;
    addClipToTimeline(store, clipFromTemplate(def, time, o.width, o.height), o.trackId);
    return true;
  }
  if (tab === 'Stickers') {
    const art = ART_STICKERS.find((s) => s.id === id);
    if (art) {
      const c = shapeClip(`sticker:${art.id}`, time, art.fill);
      c.name = art.name;
      addClipToTimeline(store, c, o.trackId);
      return true;
    }
    const shape = SHAPES.find((s) => s.id === id);
    if (!shape) return false;
    addClipToTimeline(store, shapeClip(shape.id, time), o.trackId);
    return true;
  }
  return false;
}
