import { type Clip, type Timeline, clipDuration, clipEnd } from "./types";
import { fadeEnvelope } from './clip-controls';

export const DUCK_RAMP = 0.3; // seconds to dip / recover

export const FADE_PRESETS: { name: string; fadeIn: number; fadeOut: number }[] = [
  { name: "None", fadeIn: 0, fadeOut: 0 },
  { name: "Quick", fadeIn: 0.3, fadeOut: 0.3 },
  { name: "Smooth", fadeIn: 1, fadeOut: 1 },
  { name: "Long", fadeIn: 3, fadeOut: 3 },
  { name: "In only", fadeIn: 1.5, fadeOut: 0 },
  { name: "Out only", fadeIn: 0, fadeOut: 2 },
];

function audible(c: Clip) {
  return (c.kind === "video" || c.kind === "audio") && !c.muted && c.volume > 0 && !!c.assetId;
}

/** Clips that cause ducking: audible clips that are not themselves set to duck. */
export function voiceClips(timeline: Timeline, exclude: string): Clip[] {
  return timeline.tracks
    .filter((tr) => tr.kind !== "text" && !tr.muted)
    .flatMap((tr) => tr.clips)
    .filter((c) => c.id !== exclude && audible(c) && !(c.duck && c.duck > 0));
}

/** 0..1 how much "voice" is present at time t, with smooth attack/release. */
export function duckEnvelope(voices: Clip[], t: number): number {
  let env = 0;
  for (const v of voices) {
    const a = v.start, b = clipEnd(v);
    let e = 0;
    if (t >= a && t <= b) e = 1;
    else if (t < a && t > a - DUCK_RAMP) e = 1 - (a - t) / DUCK_RAMP;
    else if (t > b && t < b + DUCK_RAMP) e = 1 - (t - b) / DUCK_RAMP;
    env = Math.max(env, e);
    if (env >= 1) break;
  }
  return env;
}

/** Final gain of a clip at timeline time t: volume × fades × ducking. */
export function clipGainAt(c: Clip, t: number, voices: Clip[] | null): number {
  const local = t - c.start;
  const d = clipDuration(c);
  if (local < 0 || local > d) return 0;
  if (c.muted) return 0;
  let g = c.volume * fadeEnvelope(local, d, c.fadeIn, c.fadeOut);
  if (c.duck && c.duck > 0 && voices) g *= 1 - Math.min(1, c.duck) * duckEnvelope(voices, t);
  return Math.max(0, g);
}
