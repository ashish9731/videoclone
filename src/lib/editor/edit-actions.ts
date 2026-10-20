import { type Clip, clipEnd, sourceTime, splitClip, uid } from './types';

export function trimAtPlayhead(c: Clip, time: number, side: 'left' | 'right'): Clip | null {
  const parts = splitClip(c, time);
  if (!parts) return null;
  return { ...(side === 'left' ? parts[1] : parts[0]), id: c.id };
}

export function insertFreeze(c: Clip, time: number): Clip[] | null {
  if (c.kind !== 'video' || c.freezeAt !== undefined || time < c.start || time >= clipEnd(c)) return null;
  const frozen: Clip = { ...c, id: uid(), name: `${c.name} · Freeze`, start: time, in: 0, out: 3, speed: 1, speedCurve: undefined, sourceDuration: 3, freezeAt: sourceTime(c, time), volume: 0, fadeIn: 0, fadeOut: 0, transitionIn: undefined, transitionOut: undefined, keyframes: {}, anim: undefined };
  const parts = splitClip(c, time);
  if (!parts) return Math.abs(time - c.start) < 0.02 ? [frozen, { ...c, start: time + 3 }] : null;
  return [parts[0], frozen, { ...parts[1], start: time + 3 }];
}