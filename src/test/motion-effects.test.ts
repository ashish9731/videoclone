import { describe, expect, it } from 'vitest';
import { EFFECTS, effectById, effectProgress } from '../lib/editor/fx';
import { TRANSITIONS, transitionName } from '../lib/editor/transitions';

describe('effect block progress', () => {
  it('starts flat and lands exactly on the block end', () => {
    expect(effectProgress(0, 4)).toBe(0);
    expect(effectProgress(4, 4)).toBe(1);
  });
  it('clamps before the start and past the end so a ramp never overshoots', () => {
    expect(effectProgress(-2, 3)).toBe(0);
    expect(effectProgress(9, 3)).toBe(1);
  });
  it('eases symmetrically around the middle', () => {
    expect(effectProgress(1.5, 3)).toBeCloseTo(0.5);
    expect(effectProgress(0.75, 3)).toBeLessThan(0.5);
    expect(effectProgress(2.25, 3)).toBeGreaterThan(0.5);
  });
  it('falls back to a three second ramp when the span is unknown', () => {
    expect(effectProgress(1.5)).toBeCloseTo(0.5);
    expect(effectProgress(3)).toBeCloseTo(1);
    expect(effectProgress(3, 0)).toBeCloseTo(1);
  });
});

describe('camera movement effects', () => {
  const post = (id: string, prog: number, k = 1, t = 0) => effectById(id)!.post!(k, t, 1, prog);

  it('zoom in pushes toward the frame over the block', () => {
    expect(post('zoom-in', 0).scale).toBeCloseTo(1);
    expect(post('zoom-in', 0.5)!.scale!).toBeGreaterThan(1);
    expect(post('zoom-in', 1)!.scale!).toBeGreaterThan(post('zoom-in', 0.5)!.scale!);
  });
  it('zoom out is the exact mirror of zoom in', () => {
    expect(post('zoom-out', 0)!.scale!).toBeCloseTo(post('zoom-in', 1)!.scale!);
    expect(post('zoom-out', 1)!.scale!).toBeCloseTo(1);
    for (const p of [0.2, 0.5, 0.8]) {
      expect(post('zoom-out', p)!.scale!).toBeGreaterThan(post('zoom-out', p + 0.1)!.scale!);
    }
  });
  it('keeps the ramp inside the intensity the user set', () => {
    expect(post('zoom-in', 1, 0)!.scale!).toBeCloseTo(1);
    expect(post('zoom-in', 1, 0.5)!.scale!).toBeLessThan(post('zoom-in', 1, 1)!.scale!);
  });
  it('gives every movement variant its own geometric signature', () => {
    expect(Object.keys(post('spin-zoom', 0))).toEqual(expect.arrayContaining(['scale', 'rotation']));
    expect(post('cam-drift', 0).dx).not.toBe(post('cam-drift', 1).dx);
    // punch in is beat-driven rather than block-driven
    expect(post('punch-in', 0, 1, 0.556)!.scale!).toBeGreaterThan(1.3);
    expect(post('punch-in', 0, 1, 1.7)!.scale!).toBeCloseTo(1);
  });
  it('has no dead preset: each one changes pixels or the transform', () => {
    for (const e of EFFECTS) expect(e.apply || e.post).toBeTruthy();
    expect(new Set(EFFECTS.map((e) => e.id)).size).toBe(EFFECTS.length);
  });
});

describe('transition library', () => {
  it('lists each preset once and never pads with generated direction variants', () => {
    expect(new Set(TRANSITIONS.map((t) => t.id)).size).toBe(TRANSITIONS.length);
    expect(new Set(TRANSITIONS.map((t) => t.name)).size).toBe(TRANSITIONS.length);
    expect(TRANSITIONS.filter((t) => t.id.startsWith('vector-'))).toEqual([]);
    // the old generated presets were named after compass bearings
    expect(TRANSITIONS.filter((t) => /north|south|\beast\b|\bwest\b/i.test(t.name))).toEqual([]);
  });
  it('offers the geometric moves the library was missing', () => {
    for (const id of ['squeeze', 'split-slide', 'ripple', 'shatter', 'zoom-blur', 'prism', 'star', 'iris-push']) {
      expect(TRANSITIONS.map((t) => t.id)).toContain(id);
    }
    for (const id of ['zoom-in', 'zoom-out']) expect(TRANSITIONS.map((t) => t.id)).toContain(id);
  });
  it('still names presets saved from the old generated variants', () => {
    expect(transitionName('vector-slide-1')).toBe('Slide northeast');
    expect(transitionName('vector-wipe-4')).toBe('Wipe south');
    expect(transitionName('zoom')).toBe('Zoom in');
    expect(transitionName('mystery')).toBe('mystery');
  });
  it('keeps directional presets honest about their group', () => {
    const groups = new Set(TRANSITIONS.map((t) => t.group));
    for (const g of ['Basic', 'Slide', 'Wipe', 'Camera', 'Shape']) expect(groups.has(g)).toBe(true);
  });
});
