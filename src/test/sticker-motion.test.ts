import { describe, expect, it } from 'vitest';
import { ART_STICKERS, MOTION_DEFAULT, STICKER_MOTIONS, applyStickerMotion, defaultShapeMotion } from '../lib/editor/stickers';
import { SHAPES } from '../lib/editor/shapes';
import { STICKER_ENTRANCE_DURATION, shapeClip } from '../lib/editor/presets';
import { type ShapeMotion, clipFromAsset } from '../lib/editor/types';
import { EditorStore } from '../lib/editor/store';
import { addClipToTimeline } from '../lib/editor/placement';

type Recorder = CanvasRenderingContext2D & { calls: { op: string; args: number[] }[] };

/** The motion engine only touches the transform + alpha, so a recording stub is enough. */
function recorder(): Recorder {
  const calls: { op: string; args: number[] }[] = [];
  const push = (op: string) => (...args: number[]) => calls.push({ op, args });
  return {
    calls,
    globalAlpha: 1,
    translate: push('translate'),
    scale: push('scale'),
    rotate: push('rotate'),
    transform: push('transform'),
  } as unknown as Recorder;
}

const motion = (over: Partial<ShapeMotion> = {}): ShapeMotion => ({ ...MOTION_DEFAULT, ...over });

/** How far one frame moved the artwork: transform deviation from identity plus alpha change. */
function movement(x: Recorder): number {
  const ops = x.calls.reduce((n, c) => {
    if (c.op === 'scale') return n + Math.abs(c.args[0]! - 1) + Math.abs(c.args[1]! - 1);
    if (c.op === 'transform') return n + Math.abs(c.args[2]!); // shear term
    return n + c.args.reduce((m, v) => m + Math.abs(v), 0);
  }, 0);
  return ops + Math.abs(1 - x.globalAlpha);
}

/** Best movement over several phases: a single frame can legitimately sit at the crossing point. */
function motionEnergy(id: string, style: string, u = 1): number {
  let best = 0;
  for (const t of [0.05, 0.2, 0.3, 0.7, 1.1, 1.3, 1.9]) {
    const x = recorder();
    applyStickerMotion(x, id, t, motion({ style }), u);
    best = Math.max(best, movement(x));
  }
  return best;
}

describe('sticker motion catalog', () => {
  it('offers auto, a looping style per entry and still', () => {
    expect(STICKER_MOTIONS[0]!.id).toBe('auto');
    expect(STICKER_MOTIONS.at(-1)!.id).toBe('none');
    expect(STICKER_MOTIONS.length).toBeGreaterThan(6);
    expect(new Set(STICKER_MOTIONS.map((m) => m.id)).size).toBe(STICKER_MOTIONS.length);
  });

  it('every catalog style actually moves the artwork', () => {
    for (const m of STICKER_MOTIONS) {
      if (m.id === 'none') continue;
      expect(motionEnergy('heart', m.id), m.id).toBeGreaterThan(1e-4);
    }
  });

  it('every sticker and shape animates by default (auto), and never with "none"', () => {
    for (const s of ART_STICKERS) {
      expect(motionEnergy(String(s.id), 'auto'), String(s.id)).toBeGreaterThan(1e-4);
    }
    for (const s of SHAPES) {
      const d = defaultShapeMotion(s.id);
      expect(d.style).not.toBe('none');
      expect(STICKER_MOTIONS.some((m) => m.id === d.style), s.id).toBe(true);
      expect(motionEnergy(s.id, d.style, 0.5), s.id).toBeGreaterThan(1e-4);
    }
  });

  it('still, zero intensity and unknown styles leave the artwork untouched', () => {
    for (const m of [motion({ style: 'none' }), motion({ amount: 0 }), motion({ style: 'from-an-old-project' })]) {
      const x = recorder();
      applyStickerMotion(x, 'heart', 1.2, m);
      expect(x.calls, m.style).toHaveLength(0);
      expect(x.globalAlpha, m.style).toBe(1);
    }
  });

  it('speed stretches time and intensity scales amplitude, both clamped', () => {
    const slow = recorder();
    applyStickerMotion(slow, 'heart', 1, motion({ style: 'swing', speed: 1 }));
    const fast = recorder();
    applyStickerMotion(fast, 'heart', 1, motion({ style: 'swing', speed: 2 }));
    expect(fast.calls[0]!.args[0]!).toBeCloseTo(Math.sin(2 * 1.8) * 0.28);
    expect(slow.calls[0]!.args[0]!).toBeCloseTo(Math.sin(1 * 1.8) * 0.28);

    const half = recorder();
    applyStickerMotion(half, 'heart', 1, motion({ style: 'swing', amount: 50 }));
    expect(half.calls[0]!.args[0]!).toBeCloseTo(Math.sin(1 * 1.8) * 0.28 * 0.5);

    const over = recorder();
    applyStickerMotion(over, 'heart', 1, motion({ style: 'swing', amount: 900 }));
    expect(over.calls[0]!.args[0]!).toBeCloseTo(Math.sin(1 * 1.8) * 0.28 * 3);

    const stopped = recorder();
    applyStickerMotion(stopped, 'heart', 1, motion({ style: 'swing', speed: 0 }));
    expect(stopped.calls[0]!.args[0]!).toBeCloseTo(Math.sin(0.1 * 1.8) * 0.28);
  });

  it('intensity is relative to the artwork unit space so shapes move in pixels too', () => {
    expect(motionEnergy('rect', 'drift', 1)).toBeGreaterThan(motionEnergy('rect', 'drift', 0.25));
  });
});

describe('adding a sticker/shape', () => {
  it('arrives with looping motion plus a short entrance', () => {
    const sticker = shapeClip('sticker:cat', 3);
    expect(sticker.shape?.motion?.style).toBe('auto');
    expect(sticker.anim?.in).toEqual({ id: 'pop', duration: STICKER_ENTRANCE_DURATION });

    const shape = shapeClip('star', 0);
    expect(shape.shape?.motion).toBeDefined();
    expect(shape.shape?.motion?.style).not.toBe('auto');
    expect(shape.anim?.in?.id).toBe('pop');
  });

  it('finishes before the seek that runs when a clip is added, so it lands fully visible', () => {
    const video = clipFromAsset({ id: 'v', name: 'v', kind: 'video', storage_path: 'x', mime: 'video/webm', size_bytes: 1, duration: 10, width: 640, height: 360, project_id: null }, 0);
    const store = new EditorStore({ tracks: [{ id: 'v', name: 'Video', kind: 'video', locked: false, muted: false, hidden: false, clips: [video] }] });
    store.set({ time: 3, playing: true });
    const sticker = shapeClip('sticker:cat', 3);
    addClipToTimeline(store, sticker);
    expect(STICKER_ENTRANCE_DURATION).toBeLessThan(0.25);
    // playhead lands at start + 0.25s, past the entrance, so the sticker is visible immediately
    expect(store.get().time).toBe(3.25);
    const clip = store.findClip(store.get().selectedClipId)?.clip;
    expect(clip?.shape?.motion?.style).toBe('auto');
  });
});
