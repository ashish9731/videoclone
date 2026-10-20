export type MediaKind = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "text";
/** id from TRANSITIONS in transitions.ts (legacy ids "zoom"/"wipe" are aliased there) */
export type TransitionType = string;
export type KeyframeProp = "x" | "y" | "scale" | "rotation" | "opacity";

export interface Keyframe {
  /** seconds relative to the clip's start on the timeline */
  t: number;
  value: number;
}

export interface Effects {
  whites?: number | undefined;
  blacks?: number | undefined;
  vibrance?: number | undefined;
  clarity?: number | undefined;
  grain?: number | undefined;
  fade?: number | undefined;
  brightness: number; // 100 = normal
  contrast: number;
  saturation: number;
  blur: number; // px
  grayscale: number; // 0-100
  sepia: number;
  hue: number; // deg
  invert: number;
  temperature?: number | undefined; // -100 cool .. 100 warm
  tint?: number | undefined; // -100 green .. 100 magenta
  exposure?: number | undefined; // stops
  highlights?: number | undefined;
  shadows?: number | undefined;
  sharpen?: number | undefined;
  vignette?: number | undefined;
}

/** A point on a speed ramp: t is normalized output time (0..1), speed a multiplier. */
export interface SpeedPoint {
  t: number;
  speed: number;
}

export interface FilterRef {
  id: string;
  intensity: number; // 0-100
}

export interface FxRef {
  speed?: number | undefined; // time multiplier
  blend?: number | undefined; // 0-100 opacity
  id: string;
  intensity: number; // 0-100
}

export interface AnimRef {
  id: string;
  duration: number; // seconds (loop: period)
}

export interface ClipAnim {
  in?: AnimRef | undefined;
  out?: AnimRef | undefined;
  loop?: AnimRef | undefined;
}

export interface ShapeStyle {
  type: string; // see SHAPES in shapes.ts
  fill: string;
  stroke: string;
  strokeWidth: number;
  w: number;
  h: number;
}

export interface Transform {
  x: number; // px offset from center, in project space
  y: number;
  scale: number; // 1 = fit
  rotation: number; // deg
  opacity: number; // 0-1
}

export interface TextStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  background: string; // "" = none
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  stroke: string;
  strokeWidth: number;
  glowColor?: string | undefined;
  glowSize?: number | undefined;
  letterSpacing?: number | undefined;
}

export interface Transition {
  type: TransitionType;
  duration: number;
}

export const BLEND_MODES = ["multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"] as const;
export type BlendMode = typeof BLEND_MODES[number];

export interface Clip {
  id: string;
  kind: MediaKind | "text" | "shape";
  assetId?: string | undefined;
  name: string;
  start: number; // timeline seconds
  in: number; // source seconds
  out: number; // source seconds
  sourceDuration: number; // full length of source (Infinity-like for image/text)
  speed: number;
  volume: number; // 0-2
  muted?: boolean | undefined;
  visualFadeIn?: number | undefined;
  visualFadeOut?: number | undefined;
  fadeIn: number; // audio fade seconds
  fadeOut: number;
  transitionIn?: Transition | undefined;
  transitionOut?: Transition | undefined;
  effects: Effects;
  transform: Transform;
  keyframes: Partial<Record<KeyframeProp, Keyframe[]>>;
  text?: TextStyle | undefined;
  shape?: ShapeStyle | undefined;
  /** custom speed ramp, multiplied with `speed` */
  speedCurve?: SpeedPoint[] | undefined;
  filter?: FilterRef | undefined;
  fx?: FxRef[] | undefined;
  anim?: ClipAnim | undefined;
  /** 0-1: how much this clip's volume dips while other (voice) audio plays */
  duck?: number | undefined;
  freezeAt?: number | undefined; // held source timestamp
  chroma?: { enabled: boolean; color: string; tolerance: number; softness: number; spill: number } | undefined;
  mask?: import("./mask").ClipMask | undefined;
  blend?: BlendMode | undefined;
  crop?: { x: number; y: number; w: number; h: number } | undefined; // normalized source rectangle
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  clips: Clip[];
}

export interface Timeline {
  tracks: Track[];
}

export interface CaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number; // relative to 1080p height
  color: string;
  background: string;
  bold: boolean;
  position: number; // 0 (top) - 1 (bottom), center of caption box
  stroke: string;
  strokeWidth: number;
  uppercase: boolean;
}

export interface CaptionTrack {
  id: string;
  project_id: string;
  name: string;
  language: string;
  cues: CaptionCue[];
  style: CaptionStyle;
  visible: boolean;
}

export interface MediaAsset {
  id: string;
  storage_path: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size_bytes: number;
  duration: number;
  width: number | null;
  height: number | null;
  project_id: string | null;
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}

export const IMAGE_DEFAULT_DURATION = 5;
export const TEXT_DEFAULT_DURATION = 4;
export const STILL_SOURCE_DURATION = 60 * 60 * 6;

export const defaultEffects = (): Effects => ({
  whites: 0, blacks: 0, vibrance: 0, clarity: 0, grain: 0, fade: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hue: 0,
  invert: 0,
});

export const defaultTransform = (): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });

export const defaultTextStyle = (): TextStyle => ({
  content: "Your text",
  fontFamily: "Sora",
  fontSize: 96,
  color: "#ffffff",
  background: "",
  bold: true,
  italic: false,
  align: "center",
  stroke: "#000000",
  strokeWidth: 0,
});

export const defaultCaptionStyle = (): CaptionStyle => ({
  fontFamily: "Sora",
  fontSize: 56,
  color: "#ffffff",
  background: "rgba(0,0,0,0.6)",
  bold: true,
  position: 0.86,
  stroke: "#000000",
  strokeWidth: 0,
  uppercase: false,
});

export function uid(): string {
  return crypto.randomUUID();
}

type Timed = Pick<Clip, "in" | "out" | "speed"> & { speedCurve?: SpeedPoint[] | undefined };

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 10;

/** Sorted curve with endpoints at t=0 and t=1; null when no curve. */
export function normCurve(pts: SpeedPoint[] | undefined): SpeedPoint[] | null {
  if (!pts || pts.length < 2) return null;
  const s = [...pts]
    .map((p) => ({ t: Math.min(1, Math.max(0, p.t)), speed: Math.min(SPEED_MAX, Math.max(SPEED_MIN, p.speed)) }))
    .sort((a, b) => a.t - b.t);
  if (s[0]!.t > 0) s.unshift({ t: 0, speed: s[0]!.speed });
  if (s[s.length - 1]!.t < 1) s.push({ t: 1, speed: s[s.length - 1]!.speed });
  return s;
}

/** Integral of the piecewise-linear curve from 0 to u (u in 0..1). */
export function curveIntegral(curve: SpeedPoint[], u: number): number {
  let acc = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]!, b = curve[i + 1]!;
    if (u <= a.t) break;
    const end = Math.min(u, b.t);
    const span = b.t - a.t;
    const sEnd = span > 0 ? a.speed + ((b.speed - a.speed) * (end - a.t)) / span : a.speed;
    acc += ((a.speed + sEnd) / 2) * (end - a.t);
  }
  return acc;
}

export function curveSpeedAt(curve: SpeedPoint[], u: number): number {
  if (u <= 0) return curve[0]!.speed;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]!, b = curve[i + 1]!;
    if (u <= b.t) return b.t > a.t ? a.speed + ((b.speed - a.speed) * (u - a.t)) / (b.t - a.t) : b.speed;
  }
  return curve[curve.length - 1]!.speed;
}

export function clipDuration(c: Timed): number {
  const curve = normCurve(c.speedCurve);
  const mean = curve ? curveIntegral(curve, 1) : 1;
  return Math.max(0, (c.out - c.in) / ((c.speed || 1) * mean));
}

/** Instantaneous playback rate at a clip-local time. */
export function speedAt(c: Timed, local: number): number {
  const curve = normCurve(c.speedCurve);
  if (!curve) return c.speed;
  const d = clipDuration(c);
  return c.speed * curveSpeedAt(curve, d > 0 ? local / d : 0);
}

export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}

export function timelineDuration(t: Timeline): number {
  let d = 0;
  for (const tr of t.tracks) for (const c of tr.clips) d = Math.max(d, clipEnd(c));
  return d;
}

/** Map a timeline time to the source time for a clip (extrapolates past the clip end at the end speed). */
export function sourceTime(c: Clip, t: number): number {
  if (c.freezeAt !== undefined) return c.freezeAt;
  const local = t - c.start;
  const curve = normCurve(c.speedCurve);
  if (!curve) return c.in + local * c.speed;
  const d = clipDuration(c);
  if (d <= 0) return c.in;
  if (local <= 0) return c.in + local * c.speed * curve[0]!.speed;
  if (local >= d) return c.out + (local - d) * c.speed * curve[curve.length - 1]!.speed;
  return c.in + d * c.speed * curveIntegral(curve, local / d);
}

/** Portion [a,b] of a curve, renormalized to 0..1. */
export function subCurve(curve: SpeedPoint[], a: number, b: number): SpeedPoint[] {
  const span = b - a || 1;
  const pts: SpeedPoint[] = [{ t: 0, speed: curveSpeedAt(curve, a) }];
  for (const p of curve) if (p.t > a && p.t < b) pts.push({ t: (p.t - a) / span, speed: p.speed });
  pts.push({ t: 1, speed: curveSpeedAt(curve, b) });
  return pts;
}

export function isActive(c: Clip, t: number): boolean {
  return t >= c.start && t < clipEnd(c);
}

/** Linear keyframe interpolation; falls back to base value when no keyframes. */
export function interpolate(frames: Keyframe[] | undefined, localT: number, base: number): number {
  if (!frames || frames.length === 0) return base;
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const first = sorted[0]!;
  if (localT <= first.t) return first.value;
  const last = sorted[sorted.length - 1]!;
  if (localT >= last.t) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (localT >= a.t && localT <= b.t) {
      const k = b.t === a.t ? 0 : (localT - a.t) / (b.t - a.t);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
      return a.value + (b.value - a.value) * e;
    }
  }
  return base;
}

/** Split a clip at a timeline time. Returns [left, right] or null when out of range. */
export function splitClip(c: Clip, t: number): [Clip, Clip] | null {
  const d = clipDuration(c);
  const local = t - c.start;
  if (local <= 0.02 || local >= d - 0.02) return null;
  const cut = sourceTime(c, t);
  const curve = normCurve(c.speedCurve);
  const u = local / d;
  const shiftKf = (side: "l" | "r") => {
    const out: Clip["keyframes"] = {};
    for (const [k, arr] of Object.entries(c.keyframes) as [KeyframeProp, Keyframe[]][]) {
      out[k] =
        side === "l"
          ? arr.filter((f) => f.t <= local)
          : arr.filter((f) => f.t >= local).map((f) => ({ ...f, t: f.t - local }));
    }
    return out;
  };
  const left: Clip = {
    ...c,
    out: cut,
    transitionOut: undefined,
    fadeOut: 0,
    keyframes: shiftKf("l"),
    speedCurve: curve ? subCurve(curve, 0, u) : c.speedCurve,
    anim: c.anim ? { ...c.anim, out: undefined } : undefined,
  };
  const right: Clip = {
    ...c,
    id: uid(),
    start: t,
    in: cut,
    transitionIn: undefined,
    fadeIn: 0,
    keyframes: shiftKf("r"),
    speedCurve: curve ? subCurve(curve, u, 1) : c.speedCurve,
    anim: c.anim ? { ...c.anim, in: undefined } : undefined,
  };
  return [left, right];
}

export function cssFilter(e: Effects): string {
  const parts: string[] = [];
  if (e.brightness !== 100) parts.push(`brightness(${e.brightness}%)`);
  if (e.contrast !== 100) parts.push(`contrast(${e.contrast}%)`);
  if (e.saturation !== 100) parts.push(`saturate(${e.saturation}%)`);
  if (e.blur > 0) parts.push(`blur(${e.blur}px)`);
  if (e.grayscale > 0) parts.push(`grayscale(${e.grayscale}%)`);
  if (e.sepia > 0) parts.push(`sepia(${e.sepia}%)`);
  if (e.hue !== 0) parts.push(`hue-rotate(${e.hue}deg)`);
  if (e.invert > 0) parts.push(`invert(${e.invert}%)`);
  return parts.length ? parts.join(" ") : "none";
}

export function formatTime(s: number, fps = 30): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * fps);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

export function formatSrtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(sec)},${p(ms, 3)}`;
}

export function cuesToSrt(cues: CaptionCue[]): string {
  return [...cues]
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}

export function newTrack(kind: TrackKind, index: number): Track {
  const label = kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Text";
  return { id: uid(), kind, name: `${label} ${index}`, muted: false, hidden: false, locked: false, clips: [] };
}

export function defaultTimeline(): Timeline {
  return { tracks: [newTrack("text", 1), newTrack("video", 1), newTrack("audio", 1)] };
}

export function clipFromAsset(a: MediaAsset, start: number): Clip {
  const still = a.kind === "image";
  const dur = still ? IMAGE_DEFAULT_DURATION : a.duration;
  return {
    id: uid(),
    kind: a.kind,
    assetId: a.id,
    name: a.name,
    start,
    in: 0,
    out: dur,
    sourceDuration: still ? STILL_SOURCE_DURATION : a.duration,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: defaultEffects(),
    transform: defaultTransform(),
    keyframes: {},
  };
}

export function textClip(start: number): Clip {
  return {
    id: uid(),
    kind: "text",
    name: "Text",
    start,
    in: 0,
    out: TEXT_DEFAULT_DURATION,
    sourceDuration: STILL_SOURCE_DURATION,
    speed: 1,
    volume: 0,
    fadeIn: 0,
    fadeOut: 0,
    effects: defaultEffects(),
    transform: defaultTransform(),
    keyframes: {},
    text: defaultTextStyle(),
  };
}

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "id", name: "Indonesian" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese (Simplified)" },
];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}
