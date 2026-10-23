import { describe, expect, it } from 'vitest';
import { effectClip, clipDuration, type Timeline, type Track } from '@/lib/editor/types';
import { maxTransitionDuration } from '@/lib/editor/transitions';
import { activeEffectClips } from '@/lib/editor/render';

describe('effectClip factory', () => {
  it('produces correct shape and defaults', () => {
    const c = effectClip('glow', 'Glow', 2, 5);
    expect(c.kind).toBe('effect');
    expect(c.name).toBe('Glow');
    expect(c.start).toBe(2);
    expect(c.in).toBe(0);
    expect(c.out).toBe(5);
    expect(c.speed).toBe(1);
    expect(c.volume).toBe(0);
    expect(c.fadeIn).toBe(0);
    expect(c.fadeOut).toBe(0);
    expect(c.fx).toEqual([{ id: 'glow', intensity: 75 }]);
    expect(c.keyframes).toEqual({});
  });
  it('clamps minimum duration to 0.1', () => {
    const c = effectClip('wave', 'Wave', 0, 0);
    expect(c.out).toBe(0.1);
    expect(clipDuration(c)).toBe(0.1);
  });
});

describe('maxTransitionDuration', () => {
  const vid = (start: number, dur: number) => ({
    id: `v${start}`, kind: 'video' as const, name: 'v', start, in: 0, out: dur,
    sourceDuration: dur, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
    effects: { brightness: 100, contrast: 100, saturation: 100, exposure: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, temperature: 0, tint: 0, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, whites: 0, blacks: 0, vibrance: 0, clarity: 0, grain: 0, fade: 0 },
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    keyframes: {},
  });
  it('leaves a visible body on the clip the transition is carved out of', () => {
    const prev = vid(0, 4);
    const next = vid(4, 2);
    expect(maxTransitionDuration(prev, next)).toBe(1.8);
  });
  it('is capped at five seconds however long the material is', () => {
    expect(maxTransitionDuration(vid(0, 10), vid(10, 10))).toBe(5);
  });
  it('a clip with nothing before it can still reveal itself', () => {
    expect(maxTransitionDuration(null, vid(4, 2))).toBe(1.8);
  });
  it('minimum is 0.1', () => {
    const prev = vid(0, 0.05);
    const next = vid(0.05, 0.05);
    expect(maxTransitionDuration(prev, next)).toBe(0.1);
  });
});

describe('activeEffectClips selector', () => {
  const makeTrack = (kind: string, clips: Timeline['tracks'][0]['clips']): Track => ({
    id: `tr-${kind}`, kind: kind as Track['kind'], name: kind, muted: false, hidden: false, locked: false, clips,
  });
  it('returns effect clips active at the given time', () => {
    const ec1 = effectClip('glow', 'Glow', 1, 3); // active from 1 to 4
    const ec2 = effectClip('wave', 'Wave', 5, 2); // active from 5 to 7
    const timeline: Timeline = { tracks: [makeTrack('effect', [ec1, ec2])] };
    expect(activeEffectClips(timeline, 2)).toEqual([ec1]);
    expect(activeEffectClips(timeline, 6)).toEqual([ec2]);
    expect(activeEffectClips(timeline, 10)).toEqual([]);
  });
  it('ignores hidden effect tracks', () => {
    const ec = effectClip('glow', 'Glow', 0, 5);
    const tr = makeTrack('effect', [ec]);
    tr.hidden = true;
    const timeline: Timeline = { tracks: [tr] };
    expect(activeEffectClips(timeline, 2)).toEqual([]);
  });
  it('ignores non-effect tracks', () => {
    const vid = { ...effectClip('glow', 'Glow', 0, 5), kind: 'video' as const };
    const timeline: Timeline = { tracks: [makeTrack('video', [vid])] };
    expect(activeEffectClips(timeline, 2)).toEqual([]);
  });
});
