import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorStore } from '@/lib/editor/store';
import { accepts, addClipToTimeline, seamTargetAt } from '@/lib/editor/placement';
import { activeEffectClips, gradeBlocksInLane } from '@/lib/editor/render';
import { nextAdjacent, prevAdjacent } from '@/lib/editor/transitions';
import { type Clip, type Track, type TrackKind, type Timeline, clipDuration, effectClip, filterClip, textClip } from '@/lib/editor/types';
import { ASSET_MIME } from '@/components/editor/library-drag';
import { FILTERS } from '@/lib/editor/fx';
import { Timeline as TimelineUI } from '@/components/editor/Timeline';

// Radix (Slider, DropdownMenu) measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/** A clip of any kind built from the effect factory's complete shape. */
const clip = (kind: Clip['kind'], start: number, dur: number, id?: string): Clip => ({
  ...effectClip('glow', 'clip', start, dur),
  id: id ?? `${kind}-${start}`,
  kind,
});

const lane = (kind: TrackKind, clips: Clip[], id = `tr-${kind}`): Track => ({
  id,
  kind,
  name: kind,
  muted: false,
  hidden: false,
  locked: false,
  clips,
});

const tl = (tracks: Track[]): Timeline => ({ tracks });

describe('every kind of block keeps its own line', () => {
  it('an effect block belongs on an effects lane and nowhere else', () => {
    expect(accepts('effect', 'effect')).toBe(true);
    for (const kind of ['video', 'audio', 'text', 'filter'] as TrackKind[]) {
      expect(accepts(kind, 'effect')).toBe(false);
    }
  });
  it('a grade block belongs on a filters lane', () => {
    expect(accepts('filter', 'filter')).toBe(true);
    for (const kind of ['video', 'audio', 'text', 'effect'] as TrackKind[]) {
      expect(accepts(kind, 'filter')).toBe(false);
    }
  });
  it('media, audio and overlays still keep their own lane type', () => {
    expect(accepts('video', 'video')).toBe(true);
    expect(accepts('video', 'image')).toBe(true);
    expect(accepts('video', 'audio')).toBe(false);
    expect(accepts('audio', 'audio')).toBe(true);
    expect(accepts('audio', 'video')).toBe(false);
    expect(accepts('text', 'text')).toBe(true);
    expect(accepts('text', 'shape')).toBe(true);
    expect(accepts('text', 'video')).toBe(false);
    expect(accepts('video', 'text')).toBe(false);
    expect(accepts('video', 'shape')).toBe(false);
  });
});

describe('blocks render from whatever lane they sit on', () => {
  it('a grade block is not a layer and not a transition partner', () => {
    const a = clip('video', 0, 4, 'a');
    const grade = clip('filter', 4, 4, 'grade');
    const tr = lane('video', [a, grade]);
    expect(nextAdjacent(tr, a)).toBeNull();
    expect(activeEffectClips(tl([lane('filter', [grade])]), 5)).toEqual([]);
  });
  it('an effect block left inside a media lane by an older project still paints', () => {
    const block = clip('effect', 2, 3);
    expect(activeEffectClips(tl([lane('video', [clip('video', 0, 4), block])]), 3)).toEqual([block]);
  });
  it('finds a block on a text lane and an audio lane', () => {
    const a = clip('effect', 0, 2, 'a');
    const b = clip('effect', 0, 2, 'b');
    const timeline = tl([lane('text', [a]), lane('audio', [b]), lane('video', [])]);
    const found = activeEffectClips(timeline, 1);
    expect(found.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
  it('a hidden lane still never paints its blocks', () => {
    const tr = lane('video', [clip('effect', 0, 5)]);
    tr.hidden = true;
    expect(activeEffectClips(tl([tr]), 2)).toEqual([]);
  });
});

describe('a grade block recolours the picture from its own line', () => {
  it('collects the blocks a lane is asking to paint at a moment', () => {
    const grade = { ...filterClip('vivid', 'Vivid', 2, 3), id: 'g' };
    const tr = lane('filter', [grade]);
    expect(gradeBlocksInLane(tr, 3)).toEqual([grade]);
    // outside its span the grade is off, so the picture below stops being recoloured
    expect(gradeBlocksInLane(tr, 6)).toEqual([]);
  });
  it('ignores ordinary clips and a block with no grade on it', () => {
    const tr = lane('filter', [
      clip('video', 0, 4, 'v'),
      { ...filterClip('vivid', 'Vivid', 0, 4), id: 'g', filter: undefined },
    ]);
    expect(gradeBlocksInLane(tr, 1)).toEqual([]);
  });
});

describe('adjacency only pairs clips that draw a layer', () => {
  it('an effect block sharing a lane cannot become a transition partner', () => {
    const a = clip('video', 0, 4, 'a');
    const block = clip('effect', 4, 4, 'block');
    const b = clip('video', 8, 4, 'b');
    const tr = lane('video', [a, block, b]);
    expect(nextAdjacent(tr, a)).toBeNull();
    expect(prevAdjacent(tr, b)).toBeNull();
  });
  it('audio sitting next to a visual clip is not a seam either', () => {
    const tr = lane('audio', [clip('audio', 0, 4, 'a'), clip('video', 4, 4, 'b')]);
    expect(prevAdjacent(tr, tr.clips[1]!)).toBeNull();
  });
  it('two touching visual clips still form a seam', () => {
    const tr = lane('text', [clip('shape', 0, 4, 'a'), clip('shape', 4, 4, 'b')]);
    expect(prevAdjacent(tr, tr.clips[1]!)?.id).toBe('a');
  });
});

describe('seamTargetAt looks for a joint on any lane', () => {
  const tracks = [
    lane('text', [clip('shape', 0, 4, 'top-a'), clip('shape', 4, 4, 'top-b')], 'tr-text'),
    lane('video', [clip('video', 0, 4, 'vid-a'), clip('video', 4, 4, 'vid-b')], 'tr-video'),
  ];
  it('resolves a seam on an overlay lane', () => {
    const hit = seamTargetAt(tracks, 4, 0.1);
    expect(hit?.clip.id).toBe('top-b');
    expect(hit?.track.id).toBe('tr-text');
  });
  it('prefers the lane the drop happened on', () => {
    const hit = seamTargetAt(tracks, 4, 0.1, 'tr-video');
    expect(hit?.clip.id).toBe('vid-b');
  });
  it('refuses where nothing touches', () => {
    expect(seamTargetAt([lane('video', [clip('video', 0, 4), clip('video', 6, 4)])], 4, 0.1)).toBeNull();
  });
});

describe('an addition that aims at no row (a gallery click)', () => {
  it('reuses the overlay line that already exists instead of stacking a new one', () => {
    const store = new EditorStore(tl([lane('effect', [], 'tr-effect'), lane('video', [], 'tr-video'), lane('text', [], 'tr-text')]));
    addClipToTimeline(store, textClip(1));
    expect(store.get().timeline.tracks.map((tr) => tr.id)).toEqual(['tr-effect', 'tr-video', 'tr-text']);
    expect(store.get().timeline.tracks[2]!.clips.map((c) => c.kind)).toEqual(['text']);
  });

  it('opens a Filters line above the media when there is no grade lane yet', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 4, 'v')])]));
    addClipToTimeline(store, filterClip('vivid', 'Vivid', 1, 2));
    expect(store.get().timeline.tracks.map((tr) => tr.kind)).toEqual(['filter', 'video']);
    expect(store.get().timeline.tracks[0]!.clips[0]!.filter?.id).toBe('vivid');
  });
});

// jsdom has no DragEvent constructor, so dispatch a MouseEvent with a fake dataTransfer.
function fireDrag(node: Element, type: string, dt: unknown, clientX: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100 });
  Object.defineProperty(ev, 'dataTransfer', { value: dt });
  node.dispatchEvent(ev);
}

const transfer = (payload: string) => ({
  types: [ASSET_MIME],
  getData: (t: string) => (t === ASSET_MIME || t === 'text/plain' ? payload : ''),
  setData: vi.fn(),
  effectAllowed: 'copy',
  dropEffect: 'copy',
});

// Timeline geometry in jsdom: rect.left = 0, scrollLeft = 0, HEADER_W = 168, pps = 60.
const xAt = (time: number) => 168 + time * 60;

describe('dragging a library preset anywhere on the timeline', () => {
  it('gives a dropped effect its own line above the video row', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 8, 'v')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const laneEl = container.querySelector('[data-track-id="tr-video"]')!;
    fireDrag(laneEl, 'drop', transfer('preset:Effects:glow'), xAt(2));
    const tracks = store.get().timeline.tracks;
    // the effects lane is inserted directly above the row it was dropped on
    expect(tracks.map((tr) => tr.kind)).toEqual(['effect', 'video']);
    expect(tracks[0]!.name).toBe('Effects 1');
    const block = tracks[0]!.clips[0]!;
    expect(block.kind).toBe('effect');
    expect(block.start).toBeCloseTo(2, 5);
    expect(block.fx?.[0]?.id).toBe('glow');
    // the block inherits the length of the material underneath it
    expect(clipDuration(block)).toBeCloseTo(8, 5);
    // nothing stays inside the video row it was dropped on
    expect(tracks[1]!.clips.map((c) => c.kind)).toEqual(['video']);
  });

  it('gathers later effect blocks on that line instead of stacking a lane per drop', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 8, 'v')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const laneEl = container.querySelector('[data-track-id="tr-video"]')!;
    fireDrag(laneEl, 'drop', transfer('preset:Effects:glow'), xAt(1));
    fireDrag(laneEl, 'drop', transfer('preset:Effects:blur'), xAt(4));
    const tracks = store.get().timeline.tracks;
    expect(tracks.map((tr) => tr.kind)).toEqual(['effect', 'video']);
    expect(tracks[0]!.clips.map((c) => c.fx?.[0]?.id)).toEqual(['glow', 'blur']);
  });

  it('drops a filter as a trimmable grade block on a Filters line', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 8, 'v')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const laneEl = container.querySelector('[data-track-id="tr-video"]')!;
    const def = FILTERS[0]!;
    fireDrag(laneEl, 'drop', transfer(`preset:Filters:${def.id}`), xAt(2));
    const tracks = store.get().timeline.tracks;
    expect(tracks.map((tr) => tr.kind)).toEqual(['filter', 'video']);
    expect(tracks[0]!.name).toBe('Filters 1');
    const grade = tracks[0]!.clips[0]!;
    expect(grade.kind).toBe('filter');
    expect(grade.filter?.id).toBe(def.id);
    expect(grade.fx).toBeUndefined();
    expect(grade.start).toBeCloseTo(2, 5);
    expect(clipDuration(grade)).toBeCloseTo(8, 5);
    // the clip it was aimed at is untouched: a grade is an object, not a clip property
    expect(tracks[1]!.clips[0]!.filter).toBeUndefined();
  });

  it('keeps a dropped sticker above the row instead of burying it in the video lane', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 8, 'v')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const laneEl = container.querySelector('[data-track-id="tr-video"]')!;
    fireDrag(laneEl, 'drop', transfer('preset:Stickers:circle'), xAt(3));
    const tracks = store.get().timeline.tracks;
    expect(tracks.map((tr) => tr.kind)).toEqual(['text', 'video']);
    expect(tracks[0]!.clips[0]!.kind).toBe('shape');
  });

  it('gathers a second sticker on the overlay line it already made', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 8, 'v')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const laneEl = container.querySelector('[data-track-id="tr-video"]')!;
    fireDrag(laneEl, 'drop', transfer('preset:Stickers:circle'), xAt(3));
    fireDrag(laneEl, 'drop', transfer('preset:Stickers:star'), xAt(5));
    const tracks = store.get().timeline.tracks;
    expect(tracks.map((tr) => tr.kind)).toEqual(['text', 'video']);
    expect(tracks[0]!.clips.every((c) => c.kind === 'shape')).toBe(true);
    expect(tracks[0]!.clips).toHaveLength(2);
  });

  it('attaches a transition to a seam on an overlay lane', () => {
    const store = new EditorStore(
      tl([lane('text', [clip('shape', 0, 4, 'a'), clip('shape', 4, 4, 'b')], 'tr-text'), lane('video', [], 'tr-video')]),
    );
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const laneEl = container.querySelector('[data-track-id="tr-text"]')!;
    fireDrag(laneEl, 'drop', transfer('preset:Transitions:fade'), xAt(4));
    expect(store.get().timeline.tracks[0]!.clips.find((c) => c.id === 'b')!.transitionIn?.type).toBe('fade');
  });

  it('refuses a transition drop that is not on a joint', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 4, 'a'), clip('video', 6, 4, 'b')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const laneEl = container.querySelector('[data-track-id="tr-video"]')!;
    fireDrag(laneEl, 'drop', transfer('preset:Transitions:fade'), xAt(4));
    expect(store.get().timeline.tracks[0]!.clips.every((c) => !c.transitionIn)).toBe(true);
  });

  it('hides the seam handle where an effect block breaks the run of visual clips', () => {
    const store = new EditorStore(
      tl([lane('video', [clip('video', 0, 4, 'a'), clip('effect', 4, 4, 'block'), clip('video', 8, 4, 'b')])]),
    );
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    expect(container.querySelectorAll('[aria-label="Add transition"]')).toHaveLength(0);
  });

  it('still offers the handle for a plain pair of touching clips', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 4, 'a'), clip('video', 4, 4, 'b')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    expect(container.querySelectorAll('[aria-label="Add transition"]')).toHaveLength(1);
  });
});
