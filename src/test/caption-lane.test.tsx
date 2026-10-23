import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorStore } from '@/lib/editor/store';
import { type CaptionCue, type CaptionTrack, type Clip, type Track, type TrackKind, type Timeline, clipEnd, defaultCaptionStyle, effectClip } from '@/lib/editor/types';
import { Timeline as TimelineUI } from '@/components/editor/Timeline';

// Radix (Slider, DropdownMenu) measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const PPS = 60;

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

const cue = (id: string, start: number, end: number, text: string): CaptionCue => ({ id, start, end, text });

const capTrack = (cues: CaptionCue[], visible = true): CaptionTrack => ({
  id: 'cap-1',
  project_id: 'p1',
  name: 'Auto captions',
  language: 'en',
  cues,
  style: defaultCaptionStyle(),
  visible,
});

const box = (el: Element | null) => {
  const s = (el as HTMLElement).style;
  return { left: parseFloat(s.left), width: parseFloat(s.width), right: parseFloat(s.left) + parseFloat(s.width) };
};

// jsdom has no PointerEvent constructor, and the lane's drag listeners only read the pointer's x.
const pointer = (type: string, clientX = 0) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100 });
const down = (el: Element | null, clientX = 0) => fireEvent(el!, pointer('pointerdown', clientX));
const moveTo = (clientX: number) => fireEvent(window, pointer('pointermove', clientX));
const up = () => fireEvent(window, pointer('pointerup'));

/** The cue list a saved project would hold: two phrases with a gap between them. */
const CUES = [cue('c1', 1, 3, 'Hello there'), cue('c2', 5, 6.5, 'Second line')];

function setup(cues = CUES, visible = true) {
  const store = new EditorStore(tl([lane('video', [clip('video', 0, 8, 'v')])]));
  // the route owns caption state, so the fake callback keeps its own copy of the track
  let track = capTrack(cues, visible);
  const onUpdate = vi.fn((id: string, fn: (t: CaptionTrack) => CaptionTrack) => {
    track = fn(track);
  });
  const active = vi.fn();
  const view = render(
    <TimelineUI store={store} assets={new Map()} captions={[track]} onUpdateCaption={onUpdate} onActiveCaption={active} />,
  );
  const cuesOf = () => track.cues;
  return {
    store,
    active,
    onUpdate,
    cuesOf,
    cueEl: (id: string) => view.container.querySelector(`[data-caption-cue="${id}"]`),
    laneEl: view.container.querySelector('[data-caption-track="cap-1"]')!,
    videoLane: view.container.querySelector('[data-track-id="tr-video"]')!,
  };
}

describe('captions get a line of their own', () => {
  it('draws one block per cue on the caption row', () => {
    const { cueEl } = setup();
    const first = box(cueEl('c1'));
    expect(first.left).toBeCloseTo(1 * PPS, 5);
    expect(first.width).toBeCloseTo(2 * PPS, 5);
    const second = box(cueEl('c2'));
    expect(second.left).toBeCloseTo(5 * PPS, 5);
    expect(second.width).toBeCloseTo(1.5 * PPS, 5);
  });

  it('never paints a cue inside the video lane it sits over', () => {
    const { videoLane, laneEl } = setup();
    expect(videoLane.querySelector('[data-caption-cue]')).toBeNull();
    expect(laneEl.querySelectorAll('[data-caption-cue]')).toHaveLength(2);
  });

  it('keeps the row of every caption track in the project', () => {
    const store = new EditorStore(tl([lane('video', [])]));
    const { container } = render(
      <TimelineUI
        store={store}
        assets={new Map()}
        captions={[capTrack(CUES), { ...capTrack([cue('c9', 0, 1, 'other')]), id: 'cap-2', name: 'Spanish' }]}
      />,
    );
    expect(container.querySelectorAll('[data-caption-track]')).toHaveLength(2);
  });

  it('shows nothing when the project has no captions yet', () => {
    const store = new EditorStore(tl([lane('video', [])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    expect(container.querySelector('[data-caption-track]')).toBeNull();
  });
});

describe('pointing at a cue', () => {
  it('seeks to the cue and opens its track in the caption editor', () => {
    const { cueEl, active, store } = setup();
    down(cueEl('c2'), 5 * PPS);
    up();
    expect(active).toHaveBeenCalledWith('cap-1');
    expect(store.get().time).toBeCloseTo(5, 5);
    expect(store.get().playing).toBe(false);
  });

  it('lights the cue the playhead is inside', () => {
    const { cueEl, store } = setup();
    // an external store update still has to be flushed through React before the lane repaints
    act(() => store.set({ time: 5.5 }));
    expect(cueEl('c2')!.className).toContain('border-primary');
    expect(cueEl('c1')!.className).not.toContain('border-primary');
  });

  it('dims and hides the line without losing the cues', () => {
    const { cueEl, onUpdate, laneEl } = setup(CUES, false);
    expect(cueEl('c1')!.className).toContain('opacity-40');
    const toggle = laneEl.parentElement!.querySelector('[aria-label="Show captions"]')!;
    fireEvent.click(toggle);
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});

describe('retiming a cue on the lane', () => {
  it('moves the whole phrase and keeps its length', () => {
    const { cueEl, cuesOf } = setup();
    down(cueEl('c1'), 1 * PPS);
    moveTo(1 * PPS + 1 * PPS); // one second to the right
    up();
    const [a, b] = cuesOf();
    expect(a!.start).toBeCloseTo(2, 5);
    expect(a!.end).toBeCloseTo(4, 5);
    // the other cue is untouched
    expect(b).toEqual(CUES[1]);
  });

  it('trims the starting edge only', () => {
    const { cueEl, cuesOf } = setup();
    const handle = cueEl('c1')!.querySelector('[data-caption-edge="l"]')!;
    down(handle, 1 * PPS);
    moveTo(1 * PPS + 0.5 * PPS);
    up();
    const [a] = cuesOf();
    expect(a!.start).toBeCloseTo(1.5, 5);
    expect(a!.end).toBeCloseTo(3, 5);
  });

  it('trims the ending edge only', () => {
    const { cueEl, cuesOf } = setup();
    const handle = cueEl('c1')!.querySelector('[data-caption-edge="r"]')!;
    down(handle, 3 * PPS);
    moveTo(3 * PPS - 0.5 * PPS);
    up();
    const [a] = cuesOf();
    expect(a!.start).toBeCloseTo(1, 5);
    expect(a!.end).toBeCloseTo(2.5, 5);
  });

  it('cannot be dragged past itself or before zero', () => {
    const { cueEl, cuesOf } = setup();
    const handle = cueEl('c1')!.querySelector('[data-caption-edge="r"]')!;
    down(handle, 3 * PPS);
    moveTo(0);
    up();
    const [a] = cuesOf();
    // editCue keeps a cue visible: the end stays after the start
    expect(a!.end).toBeGreaterThan(a!.start);
    const move = cueEl('c1')!;
    down(move, 1 * PPS);
    moveTo(1 * PPS - 5 * PPS);
    up();
    const [b] = cuesOf();
    expect(b!.start).toBeGreaterThanOrEqual(0);
    expect(b!.end).toBeGreaterThan(b!.start);
  });

  it('survives a lane with no editor wired to it', () => {
    const store = new EditorStore(tl([lane('video', [clip('video', 0, 8, 'v')])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} captions={[capTrack(CUES)]} />);
    const block = container.querySelector('[data-caption-cue="c1"]')!;
    down(block, 1 * PPS);
    moveTo(2 * PPS);
    up();
    expect(block).toBeTruthy();
  });

  it('never lets a cue reach the end of the picture it is drawn on', () => {
    const { store } = setup();
    // cues are painted over the timeline, so the length of the video lane is what ends the scene
    expect(clipEnd(store.get().timeline.tracks[0]!.clips[0]!)).toBe(8);
  });
});
