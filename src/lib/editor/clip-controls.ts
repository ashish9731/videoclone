import { type Clip, clipDuration } from './types';

/** Shared envelope for independently editable visual and audio fades. */
export function fadeEnvelope(local: number, duration: number, fadeIn: number, fadeOut: number): number {
  if (local < 0 || local > duration) return 0;
  const entering = fadeIn > 0 ? Math.min(1, local / fadeIn) : 1;
  const leaving = fadeOut > 0 ? Math.min(1, (duration - local) / fadeOut) : 1;
  return Math.max(0, entering * leaving);
}

export function visualFadeAt(c: Clip, t: number): number {
  return fadeEnvelope(Math.min(clipDuration(c), t - c.start), clipDuration(c), c.visualFadeIn ?? 0, c.visualFadeOut ?? 0);
}

export function volumeFromLine(fraction: number): number {
  return Math.round(Math.max(0, Math.min(2, (1 - fraction) * 2)) * 100) / 100;
}