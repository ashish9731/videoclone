import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorStore } from '@/lib/editor/store';
import {
  type Clip,
  type Track,
  type TrackKind,
  type Timeline,
  clampPlayhead,
  effectClip,
  isActive,
  lastFrameTime,
  timelineDuration,
} from '@/lib/editor/types';
import { Timeline as TimelineUI } from '@/components/editor/Timeline';

// Radix (Slider, DropdownMenu) measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const FPS = 30;
const HEADER_W = 168;

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

/** One 4s video: the picture runs from 0 to just before 4. */
function scene() {
  return new EditorStore(tl([lane('video', [clip('video', 0, 4, 'a')])]));
}

const xAt = (seconds: number) => HEADER_W + seconds * 60;

describe('the last frame that still paints a scene', () => {
  it('sits one frame before the timeline ends, because clip spans are half-open', () => {
    const t = tl([lane('video', [clip('video', 0, 4)])]);
    expect(timelineDuration(t)).toBe(4);
    expect(lastFrameTime(t, FPS)).toBeCloseTo(4 - 1 / FPS, 10);
    expect(isActive(t.tracks[0]!.clips[0]!, lastFrameTime(t, FPS))).toBe(true);
    // the duration itself is one frame past the final picture, where nothing is active
    expect(isActive(t.tracks[0]!.clips[0]!, 4)).toBe(false);
  });
  it('follows the project frame rate', () => {
    const t = tl([lane('video', [clip('video', 0, 4)])]);
    expect(lastFrameTime(t, 60)).toBeCloseTo(4 - 1 / 60, 10);
  });
  it('is the end of the longest lane, not of the first one', () => {
    const t = tl([lane('video', [clip('video', 0, 4)], 'v'), lane('text', [clip('text', 0, 9)], 'x')]);
    expect(lastFrameTime(t, FPS)).toBeCloseTo(9 - 1 / FPS, 10);
  });
  it('never goes negative on an empty timeline', () => {
    expect(lastFrameTime(tl([]), FPS)).toBe(0);
    expect(lastFrameTime(tl([lane('video', [])]), FPS)).toBe(0);
  });
  it('stops a seek on a frame that exists and never before the start', () => {
    const t = tl([lane('video', [clip('video', 0, 4)])]);
    expect(clampPlayhead(99, t, FPS)).toBeCloseTo(4 - 1 / FPS, 10);
    expect(clampPlayhead(2, t, FPS)).toBe(2);
    expect(clampPlayhead(-1, t, FPS)).toBe(0);
    expect(clampPlayhead(Number.NaN, t, FPS)).toBe(0);
  });
});

describe('the playhead cannot be parked in the void after the scene', () => {
  it('a click far past the end of the lane lands on the last frame', () => {
    const store = scene();
    const { container } = render(<TimelineUI store={store} assets={new Map()} fps={FPS} />);
    const laneEl = container.querySelector('[data-track-id="tr-video"]')!;
    fireEvent(laneEl, new MouseEvent('pointerdown', { bubbles: true, clientX: xAt(20), clientY: 40 }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true, clientX: xAt(20) }));
    expect(store.get().time).toBeCloseTo(4 - 1 / FPS, 5);
    expect(store.get().playing).toBe(false);
  });
  it('stepping right with the arrows stops on the last frame and keeps the scene active', () => {
    const store = scene();
    render(<TimelineUI store={store} assets={new Map()} fps={FPS} />);
    store.set({ time: 3.9 });
    for (let i = 0; i < 10; i++) fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(store.get().time).toBeCloseTo(4 - 1 / FPS, 5);
    const last = store.get().timeline.tracks[0]!.clips[0]!;
    expect(isActive(last, store.get().time)).toBe(true);
  });
  it('a frame step honours the project frame rate', () => {
    const store = scene();
    render(<TimelineUI store={store} assets={new Map()} fps={60} />);
    store.set({ time: 0 });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(store.get().time).toBeCloseTo(1 / 60, 10);
  });
  it('playing from the resting end frame restarts the scene instead of looping on black', () => {
    const store = scene();
    render(<TimelineUI store={store} assets={new Map()} fps={FPS} />);
    store.set({ time: lastFrameTime(store.get().timeline, FPS), playing: false });
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(store.get().playing).toBe(true);
    expect(store.get().time).toBe(0);
  });
});
