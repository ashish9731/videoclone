import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The stopped player must keep showing the scene it stopped on. `renderFrame` fills the stage black
 * and only paints a layer where the source already has a picture, so a frame drawn while the video
 * is still seeking is an empty one - and the loop used to go idle as soon as the sources looked
 * ready, which left that empty frame on screen for good.
 *
 * `renderFrame` is stubbed so a paint is observable as a call carrying the time it drew, and the
 * video element's decode state is driven by hand: the decoder is not what is under test, the
 * dirty-frame decision is.
 */
const paints = vi.hoisted(() => [] as number[]);
/** the stub 2d context counts its draws, and the stub renderer can be told to cost real milliseconds */
const fx = vi.hoisted(() => ({ draws: 0, slowMs: 0, throws: false }));

vi.mock('@/lib/editor/render', () => ({
  renderFrame: (_ctx: unknown, _tl: unknown, t: number) => {
    paints.push(t);
    const until = performance.now() + fx.slowMs;
    while (performance.now() < until) {
      // a heavy scene: this is what makes the governor trade preview size for frame rate
    }
    if (fx.throws) throw new Error('source vanished mid-draw');
  },
}));

vi.mock('@/lib/editor/media', () => ({
  signedUrl: async (path: string) => path,
}));

import { Preview } from '@/components/editor/Preview';
import { EditorStore } from '@/lib/editor/store';
import { PAINT_SETTLE_MS } from '@/lib/editor/perf';
import {
  type Clip,
  type MediaAsset,
  type Track,
  type Timeline,
  defaultEffects,
  defaultTransform,
} from '@/lib/editor/types';

// jsdom has no canvas and no layout: a stub 2d context is enough because renderFrame is stubbed too.
const ctxStub = {
  setTransform: () => {},
  save: () => {},
  restore: () => {},
  drawImage: () => {
    fx.draws++;
  },
  fillRect: () => {},
  clearRect: () => {},
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
} as unknown as CanvasRenderingContext2D;
HTMLCanvasElement.prototype.getContext = () => ctxStub as never;
// jsdom throws on the two media methods the loop drives constantly.
HTMLMediaElement.prototype.play = function () {
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function () {};
// Radix measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const FPS = 30;
const ASSET_PATH = '/clip.mp4';

/** One 6s video on one lane: the only material the player has to show. */
function videoScene(): EditorStore {
  const clip: Clip = {
    id: 'v1',
    kind: 'video',
    assetId: 'a1',
    name: 'clip',
    start: 0,
    in: 0,
    out: 6,
    sourceDuration: 6,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: defaultEffects(),
    transform: defaultTransform(),
    keyframes: {},
  };
  const track: Track = {
    id: 'tr-v',
    kind: 'video',
    name: 'Video 1',
    muted: false,
    hidden: false,
    locked: false,
    clips: [clip],
  };
  const timeline: Timeline = { tracks: [track] };
  return new EditorStore(timeline);
}

const assets = () =>
  new Map<string, MediaAsset>([
    [
      'a1',
      {
        id: 'a1',
        storage_path: ASSET_PATH,
        name: 'clip.mp4',
        kind: 'video',
        mime: 'video/mp4',
        size_bytes: 1024,
        duration: 6,
        width: 1280,
        height: 720,
        project_id: null,
      },
    ],
  ]);

/**
 * Mount the player on a manual animation clock, so every pass of the render loop is a frame the test
 * stamps itself (the settle budgets are measured in milliseconds).
 *
 * The `<video>` jsdom creates is given a decode model, because readiness, an in-flight seek and the
 * element's position are all the loop reads from it. Assigning a position starts a seek, exactly as
 * in a browser, and the test decides when that seek lands.
 */
async function harness() {
  paints.length = 0;
  fx.draws = 0;
  fx.slowMs = 0;
  fx.throws = false;
  let pending: ((now: number) => void) | null = null;
  let clock = 1000;
  const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    pending = cb as (now: number) => void;
    return 1;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

  const store = videoScene();
  const view = render(
    <Preview store={store} assets={assets()} captions={[]} width={1280} height={720} fps={FPS} />,
  );

  const el = view.container.querySelector('video') as HTMLVideoElement;
  expect(el).toBeTruthy();
  const state = { readyState: 4, seeking: false, currentTime: 0, paused: true };
  const seeks: number[] = [];
  let seeksLandBetweenFrames = true;
  Object.defineProperty(el, 'readyState', { get: () => state.readyState });
  Object.defineProperty(el, 'seeking', { get: () => state.seeking });
  Object.defineProperty(el, 'videoWidth', { get: () => (state.readyState >= 2 ? 1280 : 0) });
  Object.defineProperty(el, 'videoHeight', { get: () => (state.readyState >= 2 ? 720 : 0) });
  Object.defineProperty(el, 'duration', { get: () => 6 });
  Object.defineProperty(el, 'paused', { get: () => state.paused });
  Object.defineProperty(el, 'currentTime', {
    get: () => state.currentTime,
    set: (v: number) => {
      state.currentTime = v;
      state.seeking = true;
      seeks.push(v);
    },
  });
  const land = () => {
    if (!state.seeking) return;
    state.seeking = false;
    // the component ends its "just repositioned" hold on this event, like a browser ends a seek
    el.dispatchEvent(new Event('seeked'));
  };
  el.play = () => {
    state.paused = false;
    return Promise.resolve();
  };
  el.pause = () => {
    state.paused = true;
  };

  // the signed URL is handed back through a promise, so the element only has a src once the
  // microtask queue has been drained
  await act(async () => {});

  /** One pass of the loop, with the stream advancing the way it does between two animation frames. */
  const frame = (dt = 1000 / FPS) => {
    clock += dt;
    // the element stops where the timeline stops: a press of pause does not move the stream
    if (!state.paused && store.get().playing && state.readyState >= 2) state.currentTime += dt / 1000;
    if (state.seeking && seeksLandBetweenFrames) land();
    act(() => {
      const cb = pending;
      pending = null;
      cb?.(clock);
    });
  };

  return {
    store,
    el,
    seeks,
    frame,
    canvas: view.container.querySelector('canvas') as HTMLCanvasElement,
    frames: (n: number, dt = 1000 / FPS) => {
      for (let i = 0; i < n; i++) frame(dt);
    },
    ready: (n: number) => {
      state.readyState = n;
    },
    /** keep seeks in flight across pumps, so a frame can be drawn mid-seek like a real one is */
    freeze: () => {
      seeksLandBetweenFrames = false;
    },
    land,
    /** the decode falling behind the timeline clock, which is what a loaded preview really does */
    lag: (s: number) => {
      state.currentTime -= s;
    },
    paintCount: () => paints.length,
    lastPaint: () => paints[paints.length - 1],
    blits: () => fx.draws,
    cleanup: () => {
      view.unmount();
      raf.mockRestore();
    },
  };
}

describe('the frame a paused player shows', () => {
  it('paints the scene while it plays', async () => {
    const h = await harness();
    act(() => h.store.set({ time: 1, playing: true }));
    h.frames(3);
    expect(h.paintCount()).toBeGreaterThanOrEqual(3);
    h.cleanup();
  });

  it('repaints the stopped frame once the seek it triggered lands', async () => {
    const h = await harness();
    act(() => h.store.set({ time: 1, playing: true }));
    h.frames(3);
    const stoppedAt = h.store.get().time;
    // a heavy preview lets the decode trail the timeline clock, and a stop has to snap it into place
    h.lag(0.4);
    h.freeze();
    const before = h.paintCount();

    act(() => h.store.set({ playing: false }));
    h.frame();
    expect(h.seeks.at(-1)).toBeCloseTo(stoppedAt, 5);
    // the in-flight seek is not painted over: the canvas keeps the last picture it drew properly
    h.frames(4);
    expect(h.paintCount()).toBe(before);

    // the moment the decode lands the player shows the frame it stopped on. This is the regression:
    // an idle check on "are the sources ready now" left the mid-seek - empty - frame on screen.
    h.land();
    h.frame();
    expect(h.paintCount()).toBe(before + 1);
    expect(h.lastPaint()).toBeCloseTo(stoppedAt, 5);

    // settled: a stopped player that has painted its frame draws nothing further
    h.frames(6);
    expect(h.paintCount()).toBe(before + 1);
    h.cleanup();
  });

  it('paints the frame a scrub stopped on instead of the one it froze mid-drag', async () => {
    const h = await harness();
    act(() => h.store.set({ time: 0.5 }));
    h.frames(3);
    const settled = h.paintCount();
    expect(settled).toBeGreaterThan(0);
    expect(h.lastPaint()).toBeCloseTo(0.5, 5);

    h.freeze();
    act(() => h.store.set({ time: 3 }));
    h.frames(3);
    expect(h.paintCount()).toBe(settled);

    h.land();
    h.frame();
    expect(h.paintCount()).toBe(settled + 1);
    expect(h.lastPaint()).toBeCloseTo(3, 5);
    h.cleanup();
  });

  it('paints a frame the source cannot supply once the wait budget runs out, then stops', async () => {
    const h = await harness();
    act(() => h.store.set({ time: 1 }));
    h.frames(3);
    const settled = h.paintCount();
    expect(settled).toBeGreaterThan(0);

    // a file that never decodes: the last good picture is held, not overwritten with black
    h.ready(0);
    act(() => h.store.set({ time: 4 }));
    h.frame();
    expect(h.paintCount()).toBe(settled);
    // ...but only for the settle budget, so an unplayable source still ends on a painted frame
    h.frames(1, PAINT_SETTLE_MS + 50);
    expect(h.paintCount()).toBe(settled + 1);
    const gaveUp = h.paintCount();
    h.frames(4);
    expect(h.paintCount()).toBe(gaveUp);
    h.cleanup();
  });

  it('does not reposition the element when the stop is already on its frame', async () => {
    const h = await harness();
    act(() => h.store.set({ time: 2, playing: true }));
    h.frames(4);
    const seeksBefore = h.seeks.length;

    act(() => h.store.set({ playing: false }));
    h.frame();
    expect(h.seeks.length).toBe(seeksBefore);
    const stopped = h.paintCount();
    h.frames(4);
    expect(h.paintCount()).toBe(stopped);
    h.cleanup();
  });

  it('puts the last whole frame back when the stop resizes an empty canvas', async () => {
    const h = await harness();
    // a scene too heavy for the frame budget: the governor shrinks the preview while it plays...
    fx.slowMs = 100;
    act(() => h.store.set({ time: 1, playing: true }));
    h.frames(6);
    fx.slowMs = 0;
    expect(h.canvas.width).toBeLessThan(1280);
    h.frames(2);
    expect(h.canvas.width).toBeLessThan(1280);

    // ...and hands it back to full size the moment the timeline stops, which wipes the bitmap. The
    // same stop snap-seeks the video, so the picture for this time is not decodable yet: drawing the
    // frame now would be the black stage, so the frozen one goes back up instead.
    h.lag(0.4);
    h.freeze();
    const paintsBefore = h.paintCount();
    const blitsBefore = h.blits();
    act(() => h.store.set({ playing: false }));
    expect(h.canvas.width).toBe(1280);
    h.frame();
    expect(h.paintCount()).toBe(paintsBefore);
    expect(h.blits()).toBeGreaterThan(blitsBefore);

    // and once the seek lands the stopped frame is really drawn, at full size
    h.land();
    h.frame();
    expect(h.paintCount()).toBe(paintsBefore + 1);
    h.frames(4);
    expect(h.paintCount()).toBe(paintsBefore + 1);
    h.cleanup();
  });

  it('keeps the picture it has when a paint throws halfway through', async () => {
    const h = await harness();
    act(() => h.store.set({ time: 1 }));
    h.frames(2);
    const good = h.blits();

    // a source that dies mid-draw leaves the stage partly filled and stays dead, so the loop has to
    // fall back on the snapshot once and not repaint the same broken frame forever
    const noise = vi.spyOn(console, 'error').mockImplementation(() => {});
    fx.throws = true;
    act(() => h.store.set({ time: 2 }));
    h.frames(2);
    const attempted = h.paintCount();
    expect(attempted).toBeGreaterThan(0);
    expect(h.blits()).toBeGreaterThan(good);
    h.frames(4);
    expect(h.paintCount()).toBe(attempted);
    noise.mockRestore();
    h.cleanup();
  });
});
