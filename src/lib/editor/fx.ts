import { GENERATED_FILTERS, gradePixels, noiseValues, NOISE_MASK, type Grade } from "./filter-gen";
/**
 * Color pipeline, filters (LUT-style presets) and video effects.
 * Everything renders with plain canvas 2D ops + pixel math so preview and export
 * look the same in every browser (ctx.filter is only used for blur when supported).
 */
import type { Effects, FilterRef, FxRef } from "./types";
import { defaultEffects } from "./types";
import { personMask } from "./ai";

// ---------- canvas pool ----------
const pool = new Map<string, HTMLCanvasElement>();
export function poolCanvas(name: string, w: number, h: number): HTMLCanvasElement {
  // keyed by size too, so preview and export (different sizes) never fight over one canvas
  const key = `${name}@${w}x${h}`;
  let c = pool.get(key);
  if (!c) {
    c = document.createElement("canvas");
    pool.set(key, c);
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}
export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext("2d", { willReadFrequently: true })!;
}
/**
 * A context without the read hint. `willReadFrequently` pins a canvas to the CPU, which is right
 * for layers that get read back as pixels and wrong for a canvas that is only ever drawn *through*
 * a filter: measured on the same 720p frame, an feColorMatrix blit cost 1.1ms on a GPU-backed
 * canvas and 15.9ms on a CPU-backed one. Once a context exists its attributes are fixed, so these
 * canvases must never be fetched through ctx2d.
 */
function blitCtx(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext("2d")!;
}
export function clear(c: HTMLCanvasElement) {
  const x = ctx2d(c);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  x.clearRect(0, 0, c.width, c.height);
}

let filterSupport: boolean | null = null;
export function canvasFilterSupported(): boolean {
  if (filterSupport === null)
    filterSupport =
      typeof CanvasRenderingContext2D !== "undefined" &&
      "filter" in CanvasRenderingContext2D.prototype;
  return filterSupport;
}

/** Blur a canvas in place by `px`. */
export function blurInPlace(c: HTMLCanvasElement, px: number) {
  if (px < 0.3) return;
  const tmp = poolCanvas("blur-tmp", c.width, c.height);
  clearBlit(tmp);
  const t = blitCtx(tmp);
  if (canvasFilterSupported()) {
    t.filter = `blur(${px}px)`;
    t.drawImage(c, 0, 0);
    t.filter = "none";
  } else {
    const f = Math.max(1, px / 2);
    const sw = Math.max(1, Math.round(c.width / f)),
      sh = Math.max(1, Math.round(c.height / f));
    const small = poolCanvas("blur-small", sw, sh);
    clearBlit(small);
    const s = blitCtx(small);
    s.imageSmoothingEnabled = true;
    s.imageSmoothingQuality = "high";
    s.drawImage(c, 0, 0, sw, sh);
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(small, 0, 0, c.width, c.height);
  }
  clear(c);
  ctx2d(c).drawImage(tmp, 0, 0);
}

// ---------- color matrices (3x4 affine on 0..255 RGB) ----------
export type Mat = number[]; // [r0 r1 r2 r3, g0 g1 g2 g3, b0 b1 b2 b3]
export const IDENT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** returns B∘A (apply A first, then B) */
export function mul(b: Mat, a: Mat): Mat {
  const o: Mat = new Array(12).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 4 + c] = b[r * 4]! * a[c]! + b[r * 4 + 1]! * a[4 + c]! + b[r * 4 + 2]! * a[8 + c]!;
    }
    o[r * 4 + 3] =
      b[r * 4]! * a[3]! + b[r * 4 + 1]! * a[7]! + b[r * 4 + 2]! * a[11]! + b[r * 4 + 3]!;
  }
  return o;
}
export function lerpMat(a: Mat, b: Mat, k: number): Mat {
  return a.map((v, i) => v + (b[i]! - v) * k);
}
export const isIdent = (m: Mat) => m.every((v, i) => Math.abs(v - IDENT[i]!) < 1e-4);

const brightness = (b: number): Mat => [b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0];
const contrast = (c: number): Mat => {
  const o = (0.5 - 0.5 * c) * 255;
  return [c, 0, 0, o, 0, c, 0, o, 0, 0, c, o];
};
const saturate = (s: number): Mat => [
  0.213 + 0.787 * s,
  0.715 - 0.715 * s,
  0.072 - 0.072 * s,
  0,
  0.213 - 0.213 * s,
  0.715 + 0.285 * s,
  0.072 - 0.072 * s,
  0,
  0.213 - 0.213 * s,
  0.715 - 0.715 * s,
  0.072 + 0.928 * s,
  0,
];
const hue = (deg: number): Mat => {
  const a = (deg * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
    0,
  ];
};
const sepia = (a: number): Mat => {
  const k = 1 - a;
  return [
    0.393 + 0.607 * k,
    0.769 - 0.769 * k,
    0.189 - 0.189 * k,
    0,
    0.349 - 0.349 * k,
    0.686 + 0.314 * k,
    0.168 - 0.168 * k,
    0,
    0.272 - 0.272 * k,
    0.534 - 0.534 * k,
    0.131 + 0.869 * k,
    0,
  ];
};
const invert = (a: number): Mat => {
  const d = 1 - 2 * a,
    o = a * 255;
  return [d, 0, 0, o, 0, d, 0, o, 0, 0, d, o];
};
const offset = (r: number, g: number, b: number): Mat => [1, 0, 0, r, 0, 1, 0, g, 0, 0, 1, b];
const gains = (r: number, g: number, b: number): Mat => [r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0];
const temp = (t: number): Mat => offset(t * 0.3, t * 0.05, -t * 0.3); // t -100..100
const tintM = (t: number): Mat => offset(t * 0.12, -t * 0.25, t * 0.12);
const chain = (...ms: Mat[]): Mat => ms.reduce((acc, m) => mul(m, acc), IDENT);

export function adjustMatrix(e: Effects): Mat {
  return chain(
    brightness((e.brightness / 100) * Math.pow(2, e.exposure ?? 0)),
    contrast(e.contrast / 100),
    saturate(e.saturation / 100),
    hue(e.hue),
    saturate(1 - e.grayscale / 100),
    sepia(e.sepia / 100),
    invert(e.invert / 100),
    temp(e.temperature ?? 0),
    tintM(e.tint ?? 0),
  );
}

// ---------- filters ----------
export interface FilterDef {
  id: string;
  name: string;
  group: string;
  m: Mat;
  grade?: Grade;
  vignette?: number;
  /** css swatch for the picker */
  swatch: string;
}
export const FILTERS: FilterDef[] = [
  ...GENERATED_FILTERS,
  {
    id: "vivid",
    name: "Vivid",
    group: "Life",
    m: chain(saturate(1.45), contrast(1.12)),
    swatch: "linear-gradient(135deg,#ff5f6d,#ffc371)",
  },
  {
    id: "fresh",
    name: "Fresh",
    group: "Life",
    m: chain(brightness(1.06), saturate(1.2), temp(-15)),
    swatch: "linear-gradient(135deg,#a8e063,#56ab2f)",
  },
  {
    id: "warm",
    name: "Warm",
    group: "Life",
    m: chain(temp(45), saturate(1.1)),
    swatch: "linear-gradient(135deg,#f7971e,#ffd200)",
  },
  {
    id: "cool",
    name: "Cool",
    group: "Life",
    m: chain(temp(-45), saturate(0.95)),
    swatch: "linear-gradient(135deg,#2193b0,#6dd5ed)",
  },
  {
    id: "pastel",
    name: "Pastel",
    group: "Life",
    m: chain(saturate(0.7), contrast(0.85), brightness(1.12)),
    swatch: "linear-gradient(135deg,#fbc2eb,#a6c1ee)",
  },
  {
    id: "food",
    name: "Delicious",
    group: "Life",
    m: chain(saturate(1.3), temp(25), contrast(1.08)),
    swatch: "linear-gradient(135deg,#f12711,#f5af19)",
  },
  {
    id: "teal-orange",
    name: "Teal & Orange",
    group: "Movie",
    m: chain(gains(1.12, 1, 0.9), offset(6, 0, 10), mul(saturate(1.25), contrast(1.1)), hue(-6)),
    vignette: 0.3,
    swatch: "linear-gradient(135deg,#008080,#ff8c00)",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    group: "Movie",
    m: chain(contrast(1.2), saturate(0.85), temp(-12), offset(0, 4, 10)),
    vignette: 0.45,
    swatch: "linear-gradient(135deg,#0f2027,#2c5364)",
  },
  {
    id: "bleach",
    name: "Bleach",
    group: "Movie",
    m: chain(saturate(0.45), contrast(1.35)),
    swatch: "linear-gradient(135deg,#8e9eab,#eef2f3)",
  },
  {
    id: "moody",
    name: "Moody",
    group: "Movie",
    m: chain(brightness(0.88), contrast(1.18), saturate(0.75), temp(-20)),
    vignette: 0.5,
    swatch: "linear-gradient(135deg,#232526,#414345)",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    group: "Movie",
    m: chain(gains(1.1, 0.85, 1.25), offset(10, -5, 25), contrast(1.15), saturate(1.3)),
    swatch: "linear-gradient(135deg,#fc00ff,#00dbde)",
  },
  {
    id: "matrix",
    name: "Matrix",
    group: "Movie",
    m: chain(gains(0.75, 1.15, 0.75), contrast(1.15)),
    swatch: "linear-gradient(135deg,#000,#0f0)",
  },
  {
    id: "vintage",
    name: "Vintage",
    group: "Retro",
    m: chain(sepia(0.55), contrast(0.92), brightness(1.05), saturate(0.85)),
    vignette: 0.4,
    swatch: "linear-gradient(135deg,#c79081,#dfa579)",
  },
  {
    id: "film",
    name: "Kodak",
    group: "Retro",
    m: chain(temp(30), contrast(1.1), saturate(1.15), offset(8, 4, -6)),
    swatch: "linear-gradient(135deg,#e6b980,#eacda3)",
  },
  {
    id: "polaroid",
    name: "Polaroid",
    group: "Retro",
    m: chain(contrast(0.9), brightness(1.1), offset(10, 6, 0), saturate(0.9)),
    swatch: "linear-gradient(135deg,#ffefba,#ffffff)",
  },
  {
    id: "faded",
    name: "Faded",
    group: "Retro",
    m: chain(contrast(0.75), offset(18, 18, 22), saturate(0.8)),
    swatch: "linear-gradient(135deg,#bdc3c7,#2c3e50)",
  },
  {
    id: "sunset",
    name: "Sunset",
    group: "Retro",
    m: chain(gains(1.15, 0.95, 0.85), offset(10, 0, -5), saturate(1.2)),
    swatch: "linear-gradient(135deg,#ff7e5f,#feb47b)",
  },
  {
    id: "bw",
    name: "B&W",
    group: "Mono",
    m: chain(saturate(0)),
    swatch: "linear-gradient(135deg,#000,#fff)",
  },
  {
    id: "noir",
    name: "Noir",
    group: "Mono",
    m: chain(saturate(0), contrast(1.6), brightness(0.85)),
    vignette: 0.55,
    swatch: "linear-gradient(135deg,#000,#555)",
  },
  {
    id: "silver",
    name: "Silver",
    group: "Mono",
    m: chain(saturate(0), contrast(0.85), brightness(1.12)),
    swatch: "linear-gradient(135deg,#d7d2cc,#304352)",
  },
  {
    id: "sepia",
    name: "Sepia",
    group: "Mono",
    m: chain(sepia(1)),
    swatch: "linear-gradient(135deg,#704214,#c8a165)",
  },
  {
    id: "forest",
    name: "Forest",
    group: "Scenery",
    m: chain(gains(0.9, 1.1, 0.9), saturate(1.15), contrast(1.05)),
    swatch: "linear-gradient(135deg,#134e5e,#71b280)",
  },
  {
    id: "ocean",
    name: "Ocean",
    group: "Scenery",
    m: chain(gains(0.85, 1, 1.18), saturate(1.1)),
    swatch: "linear-gradient(135deg,#1a2980,#26d0ce)",
  },
  {
    id: "golden",
    name: "Golden hour",
    group: "Scenery",
    m: chain(temp(55), brightness(1.05), saturate(1.15)),
    swatch: "linear-gradient(135deg,#f2994a,#f2c94c)",
  },
  {
    id: "night",
    name: "Night",
    group: "Scenery",
    m: chain(brightness(0.8), temp(-50), saturate(0.8), contrast(1.1)),
    vignette: 0.5,
    swatch: "linear-gradient(135deg,#141e30,#243b55)",
  },
  // Doc-category filters — each name is a real functional grade composed from matrix primitives.
  {
    id: "neon-magenta",
    name: "Neon Magenta",
    group: "Neon",
    m: chain(gains(1.25, 0.75, 1.35), offset(-10, -5, 20), contrast(1.2), saturate(1.4)),
    swatch: "linear-gradient(135deg,#ff00cc,#333399)",
  },
  {
    id: "neon-cyan",
    name: "Neon Cyan",
    group: "Neon",
    m: chain(gains(0.75, 1.2, 1.3), offset(-15, 10, 20), contrast(1.2), saturate(1.35)),
    swatch: "linear-gradient(135deg,#00f0ff,#001a4d)",
  },
  {
    id: "neon-city",
    name: "City Lights",
    group: "Neon",
    m: chain(
      gains(1.2, 0.85, 1.3),
      contrast(1.3),
      brightness(0.9),
      saturate(1.4),
      offset(-5, 0, 10),
    ),
    vignette: 0.35,
    swatch: "linear-gradient(135deg,#7b2ff7,#f107a3)",
  },
  {
    id: "dreamy-soft",
    name: "Dreamy Soft",
    group: "Dreamy",
    m: chain(brightness(1.12), contrast(0.85), saturate(0.85), offset(10, 4, 14)),
    swatch: "linear-gradient(135deg,#fdeff9,#accbee)",
  },
  {
    id: "dreamy-glow",
    name: "Soft Glow",
    group: "Dreamy",
    m: chain(brightness(1.15), saturate(1.05), temp(20), contrast(0.9), offset(14, 8, 4)),
    swatch: "linear-gradient(135deg,#fff1eb,#ace0f9)",
  },
  {
    id: "dreamy-aura",
    name: "Golden Aura",
    group: "Dreamy",
    m: chain(temp(40), brightness(1.08), saturate(1.15), contrast(0.95), offset(12, 6, -4)),
    swatch: "linear-gradient(135deg,#fddb92,#d1fdff)",
  },
  {
    id: "pastel-pink",
    name: "Pastel Pink",
    group: "Pastel",
    m: chain(saturate(0.6), brightness(1.15), contrast(0.8), offset(18, 8, 14)),
    swatch: "linear-gradient(135deg,#ffdde1,#ee9ca7)",
  },
  {
    id: "pastel-lav",
    name: "Lavender Fade",
    group: "Pastel",
    m: chain(saturate(0.65), brightness(1.12), contrast(0.85), gains(1.02, 0.98, 1.08)),
    swatch: "linear-gradient(135deg,#dac4ff,#f7cad0)",
  },
  {
    id: "pastel-mint",
    name: "Muted Mint",
    group: "Pastel",
    m: chain(saturate(0.55), brightness(1.14), contrast(0.85), gains(0.98, 1.05, 1.02)),
    swatch: "linear-gradient(135deg,#b5e6c1,#c9e9f6)",
  },
  {
    id: "vibrant-pop",
    name: "Pop Vibrant",
    group: "Vibrant",
    m: chain(saturate(1.6), contrast(1.18), brightness(1.02)),
    swatch: "linear-gradient(135deg,#ff6ec4,#7873f5)",
  },
  {
    id: "vibrant-freedom",
    name: "Freedom",
    group: "Vibrant",
    m: chain(saturate(1.5), temp(10), contrast(1.1), gains(1.05, 1, 1.05)),
    swatch: "linear-gradient(135deg,#f7ff00,#56ab2f)",
  },
  {
    id: "vibrant-hum",
    name: "Humble",
    group: "Vibrant",
    m: chain(saturate(1.4), contrast(1.15), brightness(0.98), offset(4, 0, 6)),
    swatch: "linear-gradient(135deg,#ee0979,#ff6a00)",
  },
  {
    id: "warm-golden-hr",
    name: "Golden Hour",
    group: "Warm",
    m: chain(temp(60), brightness(1.05), saturate(1.18), contrast(1.02), offset(12, 4, -8)),
    swatch: "linear-gradient(135deg,#f6d365,#fda085)",
  },
  {
    id: "warm-amber",
    name: "Amber Film",
    group: "Warm",
    m: chain(temp(45), saturate(1.1), contrast(1.05), gains(1.08, 1, 0.9)),
    swatch: "linear-gradient(135deg,#ffecd2,#fcb69f)",
  },
  {
    id: "warm-summer",
    name: "Summer",
    group: "Warm",
    m: chain(temp(35), brightness(1.06), saturate(1.2), contrast(1.02)),
    swatch: "linear-gradient(135deg,#fddb92,#d1fdff)",
  },
  {
    id: "cool-winter",
    name: "Winter",
    group: "Cool",
    m: chain(temp(-55), brightness(1.02), saturate(0.9), contrast(1.1), offset(-8, 0, 12)),
    swatch: "linear-gradient(135deg,#83a4d4,#b6fbff)",
  },
  {
    id: "cool-teal",
    name: "Teal Cold",
    group: "Cool",
    m: chain(gains(0.85, 1.05, 1.2), offset(-10, 4, 12), saturate(1.05), contrast(1.08)),
    swatch: "linear-gradient(135deg,#1cd8d2,#2af598)",
  },
  {
    id: "cool-night-moody",
    name: "Night Mood",
    group: "Cool",
    m: chain(temp(-40), brightness(0.9), contrast(1.2), saturate(0.85), gains(0.9, 1, 1.15)),
    vignette: 0.4,
    swatch: "linear-gradient(135deg,#141e30,#243b55)",
  },
  {
    id: "nat-clean",
    name: "Clean",
    group: "Natural",
    m: chain(brightness(1.03), saturate(1.05), contrast(1.02)),
    swatch: "linear-gradient(135deg,#e0eafc,#cfdef3)",
  },
  {
    id: "nat-neutral",
    name: "Neutral",
    group: "Natural",
    m: chain(saturate(0.95), contrast(1.02), brightness(1.02)),
    swatch: "linear-gradient(135deg,#d3d3d3,#f5f5f5)",
  },
  {
    id: "nat-fresh-por",
    name: "Fresh Portrait",
    group: "Natural",
    m: chain(brightness(1.05), saturate(1.02), temp(-8), contrast(1.02)),
    swatch: "linear-gradient(135deg,#fce38a,#f38181)",
  },
  {
    id: "food-fresh",
    name: "Fresh Food",
    group: "Food",
    m: chain(saturate(1.32), temp(22), contrast(1.1), brightness(1.03)),
    swatch: "linear-gradient(135deg,#f9d423,#ff4e50)",
  },
  {
    id: "food-warm-bright",
    name: "Warm Bright",
    group: "Food",
    m: chain(temp(38), brightness(1.08), saturate(1.25), contrast(1.06)),
    swatch: "linear-gradient(135deg,#f7971e,#ffd200)",
  },
  {
    id: "food-vivid",
    name: "Vivid Plate",
    group: "Food",
    m: chain(saturate(1.45), contrast(1.15), gains(1.08, 1, 0.95)),
    swatch: "linear-gradient(135deg,#f12711,#f5af19)",
  },
  {
    id: "mov-blockbuster",
    name: "Blockbuster",
    group: "Cinematic",
    m: chain(gains(1.15, 1, 0.9), contrast(1.22), saturate(1.1), temp(6), offset(6, 0, 4)),
    vignette: 0.4,
    swatch: "linear-gradient(135deg,#232526,#414345)",
  },
  {
    id: "mov-hollywood",
    name: "Hollywood Past",
    group: "Cinematic",
    m: chain(sepia(0.25), contrast(1.18), saturate(0.9), temp(18), offset(6, 2, -2)),
    vignette: 0.35,
    swatch: "linear-gradient(135deg,#2c3e50,#bdc3c7)",
  },
  {
    id: "drama-tealorange",
    name: "Drama Teal-Orange",
    group: "Cinematic",
    m: chain(gains(1.18, 0.98, 0.85), offset(10, 2, 14), contrast(1.22), saturate(1.2)),
    vignette: 0.42,
    swatch: "linear-gradient(135deg,#008080,#ff8c00)",
  },
];
export const filterById = (id: string) => FILTERS.find((f) => f.id === id);

/** Final color matrix for a clip (adjustments, then filter at intensity). */
export function clipColorMatrix(
  e: Effects,
  f: FilterRef | undefined,
): { m: Mat; vignette: number } {
  let m = adjustMatrix(e);
  let vignette = (e.vignette ?? 0) / 100;
  const def = f ? filterById(f.id) : undefined;
  if (def && f) {
    const k = Math.max(0, Math.min(1, f.intensity / 100));
    m = mul(lerpMat(IDENT, def.m, k), m);
    vignette = Math.min(1, vignette + (def.vignette ?? 0) * k);
  }
  return { m, vignette };
}

/** Pointwise color matrix over an RGBA buffer (no read-back; the caller owns it). */
function matrixInPlace(d: Uint8ClampedArray, m: Mat) {
  const [a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i]!,
      g = d[i + 1]!,
      b = d[i + 2]!;
    d[i] = a0 * r + a1 * g + a2 * b + a3;
    d[i + 1] = b0 * r + b1 * g + b2 * b + b3;
    d[i + 2] = c0 * r + c1 * g + c2 * b + c3;
  }
}

// ---------- GPU color matrix ----------
/**
 * A 3x4 matrix on 0..255 RGB is exactly `feColorMatrix`, and the GPU does it to a whole 720p
 * layer in well under a millisecond where the JS loop above costs ~14ms plus a ~4ms read-back -
 * the single biggest per-frame cost of an adjustment or a matrix-only filter. The buffer layout is
 * the same order as `Mat`, with the offsets divided by 255 because SVG constants are 0..1.
 */
const MATRIX_FILTER_ID = "fx-color-matrix";
const svgMatrix = (m: Mat) => {
  const [a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return `${a0} ${a1} ${a2} 0 ${a3 / 255} ${b0} ${b1} ${b2} 0 ${b3 / 255} ${c0} ${c1} ${c2} 0 ${c3 / 255} 0 0 0 1 0`;
};

let matrixFilterEl: SVGFEColorMatrixElement | null | undefined; // undefined = not attempted yet
let gpuMatrix: boolean | undefined; // undefined = not verified yet
let lastSvgMatrix = "";

function ensureMatrixFilter(): SVGFEColorMatrixElement | null {
  if (matrixFilterEl === undefined) {
    matrixFilterEl = null;
    if (typeof document !== "undefined" && typeof document.createElementNS === "function") {
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
      const filter = document.createElementNS(NS, "filter");
      filter.id = MATRIX_FILTER_ID;
      // the default linearRGB would not match the plain math in matrixInPlace
      filter.setAttribute("color-interpolation-filters", "sRGB");
      const cm = document.createElementNS(NS, "feColorMatrix");
      cm.setAttribute("type", "matrix");
      filter.appendChild(cm);
      svg.appendChild(filter);
      document.documentElement.appendChild(svg);
      matrixFilterEl = cm;
    }
  }
  return matrixFilterEl;
}

/**
 * `canvasFilterSupported` only proves the property exists; filters have silently done nothing in
 * this engine before, which made effects disappear. So the GPU path is taken only after a 16x16
 * frame has been graded both ways and matched: output must change *and* agree with matrixInPlace.
 */
function verifyGpuMatrix(cm: SVGFEColorMatrixElement): boolean {
  try {
    const n = 16;
    const m: Mat = [1.15, 0, -0.1, 14, -0.05, 1.05, 0.1, -9, 0.02, 0, 0.9, 4];
    const src = document.createElement("canvas");
    src.width = src.height = n;
    const sx = ctx2d(src);
    const raw = sx.createImageData(n, n);
    for (let i = 0; i < raw.data.length; i += 4) {
      raw.data[i] = (i * 7) % 256;
      raw.data[i + 1] = (i * 13) % 256;
      raw.data[i + 2] = (i * 29) % 256;
      raw.data[i + 3] = 255;
    }
    sx.putImageData(raw, 0, 0);
    const expect = sx.getImageData(0, 0, n, n);
    matrixInPlace(expect.data, m);
    cm.setAttribute("values", svgMatrix(m));
    lastSvgMatrix = cm.getAttribute("values") ?? "";
    // the same trip the real pass takes: CPU source -> GPU filter -> CPU destination
    const gpu = document.createElement("canvas");
    gpu.width = gpu.height = n;
    const gx = blitCtx(gpu);
    gx.filter = `url(#${MATRIX_FILTER_ID})`;
    gx.drawImage(src, 0, 0);
    gx.filter = "none";
    const dst = document.createElement("canvas");
    dst.width = dst.height = n;
    const dx = ctx2d(dst);
    dx.drawImage(gpu, 0, 0);
    const got = dx.getImageData(0, 0, n, n).data;
    let changed = 0;
    let worst = 0;
    for (let i = 0; i < got.length; i += 4) {
      if (
        got[i] !== raw.data[i] ||
        got[i + 1] !== raw.data[i + 1] ||
        got[i + 2] !== raw.data[i + 2]
      )
        changed++;
      for (let ch = 0; ch < 3; ch++)
        worst = Math.max(worst, Math.abs(got[i + ch]! - expect.data[i + ch]!));
    }
    return changed > got.length / 8 && worst <= 2;
  } catch {
    return false;
  }
}

function gpuMatrixReady(): boolean {
  if (gpuMatrix === undefined) {
    const cm = ensureMatrixFilter();
    gpuMatrix = cm ? verifyGpuMatrix(cm) : false;
  }
  return gpuMatrix;
}

/** Clear a blit-only canvas (kept off the CPU on purpose, so `clear` is not used here). */
function clearBlit(c: HTMLCanvasElement) {
  const x = blitCtx(c);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  x.filter = "none";
  x.clearRect(0, 0, c.width, c.height);
}

/** Draw `L` through the matrix into `into`. False when this browser can't be trusted with it. */
function matrixViaGpu(L: HTMLCanvasElement, m: Mat, into: HTMLCanvasElement): boolean {
  const cm = ensureMatrixFilter();
  if (!cm || !gpuMatrixReady()) return false;
  const values = svgMatrix(m);
  if (values !== lastSvgMatrix) {
    cm.setAttribute("values", values);
    lastSvgMatrix = values;
  }
  clearBlit(into);
  const t = blitCtx(into);
  t.filter = `url(#${MATRIX_FILTER_ID})`;
  t.drawImage(L, 0, 0);
  t.filter = "none";
  return true;
}

// ---------- helpers ----------
export function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Composite something drawn by `draw` onto the layer, masked to the layer's own pixels. */
function maskedOverlay(
  L: HTMLCanvasElement,
  op: GlobalCompositeOperation,
  alpha: number,
  draw: (x: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const tmp = poolCanvas("fx-overlay", L.width, L.height);
  clear(tmp);
  const t = ctx2d(tmp);
  draw(t, L.width, L.height);
  t.globalCompositeOperation = "destination-in";
  t.drawImage(L, 0, 0);
  t.globalCompositeOperation = "source-over";
  const x = ctx2d(L);
  x.save();
  x.globalCompositeOperation = op;
  x.globalAlpha = alpha;
  x.drawImage(tmp, 0, 0);
  x.restore();
}

export function vignette(L: HTMLCanvasElement, k: number) {
  if (k <= 0.001) return;
  maskedOverlay(L, "multiply", Math.min(1, k), (x, w, h) => {
    const g = x.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.hypot(w, h) / 2,
    );
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
}

function copyOf(L: HTMLCanvasElement, key = "fx-copy") {
  const c = poolCanvas(key, L.width, L.height);
  clear(c);
  ctx2d(c).drawImage(L, 0, 0);
  return c;
}

export function pixelate(L: HTMLCanvasElement, size: number) {
  size = Math.max(2, Math.round(size));
  const sw = Math.max(1, Math.ceil(L.width / size)),
    sh = Math.max(1, Math.ceil(L.height / size));
  const small = poolCanvas("fx-pix", sw, sh);
  clear(small);
  const s = ctx2d(small);
  s.imageSmoothingEnabled = true;
  s.drawImage(L, 0, 0, sw, sh);
  clear(L);
  const x = ctx2d(L);
  x.imageSmoothingEnabled = false;
  x.drawImage(small, 0, 0, sw * size, sh * size);
  x.imageSmoothingEnabled = true;
}

export function rgbSplit(L: HTMLCanvasElement, dx: number, dy = 0) {
  dx = Math.round(dx);
  dy = Math.round(dy);
  if (!dx && !dy) return;
  const x = ctx2d(L);
  const w = L.width,
    h = L.height;
  const src = x.getImageData(0, 0, w, h);
  const out = x.createImageData(w, h);
  const s = src.data,
    o = out.data;
  for (let y = 0; y < h; y++) {
    const yr = Math.min(h - 1, Math.max(0, y - dy)),
      yb = Math.min(h - 1, Math.max(0, y + dy));
    for (let xx = 0; xx < w; xx++) {
      const i = (y * w + xx) * 4;
      const ir = (yr * w + Math.min(w - 1, Math.max(0, xx - dx))) * 4;
      const ib = (yb * w + Math.min(w - 1, Math.max(0, xx + dx))) * 4;
      o[i] = s[ir]!;
      o[i + 1] = s[i + 1]!;
      o[i + 2] = s[ib + 2]!;
      o[i + 3] = Math.max(s[i + 3]!, s[ir + 3]!, s[ib + 3]!);
    }
  }
  x.putImageData(out, 0, 0);
}

function slices(L: HTMLCanvasElement, seed: number, count: number, maxShift: number) {
  const src = copyOf(L, "fx-slice");
  const x = ctx2d(L);
  for (let i = 0; i < count; i++) {
    const y = Math.floor(rand(seed + i * 3.1) * L.height);
    const hh = Math.max(2, Math.floor(rand(seed + i * 7.7) * L.height * 0.08));
    const dx = (rand(seed + i * 1.3) - 0.5) * 2 * maxShift;
    x.clearRect(0, y, L.width, hh);
    x.drawImage(src, 0, y, L.width, hh, dx, y, L.width, hh);
  }
}

function pixelOp(L: HTMLCanvasElement, fn: (d: Uint8ClampedArray, i: number) => void) {
  const x = ctx2d(L);
  const img = x.getImageData(0, 0, L.width, L.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] !== 0) fn(d, i);
  x.putImageData(img, 0, 0);
}

let noiseTile: HTMLCanvasElement | null = null;
function noise(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement("canvas");
  noiseTile.width = noiseTile.height = 256;
  const x = noiseTile.getContext("2d")!;
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand(i * 0.37) * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return noiseTile;
}
function grain(L: HTMLCanvasElement, k: number, t: number) {
  maskedOverlay(L, "overlay", k, (x, w, h) => {
    const p = x.createPattern(noise(), "repeat")!;
    const ox = Math.floor(rand(Math.floor(t * 24)) * 256),
      oy = Math.floor(rand(Math.floor(t * 24) + 9) * 256);
    x.translate(-ox, -oy);
    x.fillStyle = p;
    x.fillRect(0, 0, w + 256, h + 256);
    x.setTransform(1, 0, 0, 1, 0, 0);
  });
}

function particles(
  L: HTMLCanvasElement,
  t: number,
  n: number,
  draw: (x: CanvasRenderingContext2D, px: number, py: number, i: number, s: number) => void,
  speed: number,
  scale: number,
) {
  const x = ctx2d(L);
  const w = L.width,
    h = L.height;
  x.save();
  for (let i = 0; i < n; i++) {
    const px = (rand(i) * w + Math.sin(t * 1.3 + i) * 12 * scale) % w;
    const py =
      ((rand(i + 500) * h + t * speed * scale * (0.6 + rand(i + 99) * 0.8)) % (h + 40 * scale)) -
      20 * scale;
    draw(x, px, py, i, scale);
  }
  x.restore();
}

// ---------- effects ----------
export interface PostTransform {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
}
export interface FxDef {
  id: string;
  name: string;
  /** library category; free-form so new looks can add their own group */
  group: string;
  /** geometric jitter applied when compositing the layer; `prog` is eased 0..1 across the block */
  post?: (k: number, t: number, s: number, prog?: number) => Partial<PostTransform>;
  /** pixel/canvas operation on the layer; s = output px per 1080p unit */
  apply?: (L: HTMLCanvasElement, k: number, t: number, s: number, prog?: number) => void;
}

/**
 * Eased progress through an effect block. Camera moves (zoom in/out) are authored against the
 * block length, so the span is threaded in; without one a 3s ramp keeps them animating.
 */
export function effectProgress(t: number, dur?: number): number {
  const span = dur && dur > 0 ? dur : 3;
  const p = Math.max(0, Math.min(1, t / span));
  return p * p * (3 - 2 * p);
}

export const EFFECTS: FxDef[] = [
  {
    id: "bg-remove",
    name: "Remove background",
    group: "AI portrait",
    apply: (L, k) => {
      const m = personMask(L);
      if (!m) return;
      const orig = k < 1 ? copyOf(L, "ai-orig") : null;
      const x = ctx2d(L);
      x.save();
      x.globalCompositeOperation = "destination-in";
      x.drawImage(m, 0, 0);
      // intensity below 100% keeps a faint background
      if (orig) {
        x.globalCompositeOperation = "destination-over";
        x.globalAlpha = 1 - k;
        x.drawImage(orig, 0, 0);
      }
      x.restore();
    },
  },
  {
    id: "bg-blur",
    name: "Portrait blur",
    group: "AI portrait",
    apply: (L, k, _t, s) => {
      const m = personMask(L);
      if (!m) return;
      const person = copyOf(L, "ai-person");
      const px = ctx2d(person);
      px.globalCompositeOperation = "destination-in";
      px.drawImage(m, 0, 0);
      px.globalCompositeOperation = "source-over";
      blurInPlace(L, (4 + 26 * k) * s);
      ctx2d(L).drawImage(person, 0, 0);
    },
  },
  { id: "blur", name: "Blur", group: "Basic", apply: (L, k, _t, s) => blurInPlace(L, k * 30 * s) },
  { id: "vignette", name: "Vignette", group: "Basic", apply: (L, k) => vignette(L, k) },
  { id: "grain", name: "Film grain", group: "Retro", apply: (L, k, t) => grain(L, k * 0.7, t) },
  {
    id: "glow",
    name: "Dreamy glow",
    group: "Lens",
    apply: (L, k, _t, s) => {
      const c = copyOf(L, "fx-glow");
      blurInPlace(c, 18 * s);
      const x = ctx2d(L);
      x.save();
      x.globalCompositeOperation = "screen";
      x.globalAlpha = k * 0.8;
      x.drawImage(c, 0, 0);
      x.restore();
    },
  },
  {
    id: "pixelate",
    name: "Pixelate",
    group: "Distort",
    apply: (L, k, _t, s) => pixelate(L, (3 + k * 45) * s),
  },
  {
    id: "rgb-split",
    name: "RGB split",
    group: "Distort",
    apply: (L, k, t, s) => rgbSplit(L, k * 28 * s * (0.8 + 0.2 * Math.sin(t * 6))),
  },
  {
    id: "glitch",
    name: "Glitch",
    group: "Distort",
    apply: (L, k, t, s) => {
      const seed = Math.floor(t * 12);
      const burst = rand(seed) < 0.35 + k * 0.5;
      if (!burst) return;
      rgbSplit(L, (6 + rand(seed + 1) * 30) * k * s, (rand(seed + 2) - 0.5) * 8 * k * s);
      slices(L, seed * 13, Math.round(3 + k * 9), 80 * k * s);
    },
  },
  {
    id: "wave",
    name: "Wave",
    group: "Distort",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-wave");
      clear(L);
      const x = ctx2d(L);
      const band = Math.max(2, Math.round(4 * s));
      for (let y = 0; y < L.height; y += band) {
        const dx = Math.sin(y / (40 * s) + t * 5) * 30 * k * s;
        x.drawImage(src, 0, y, L.width, band, dx, y, L.width, band);
      }
    },
  },
  {
    id: "zoom-blur",
    name: "Zoom blur",
    group: "Lens",
    apply: (L, k) => {
      const src = copyOf(L, "fx-zb");
      const x = ctx2d(L);
      const w = L.width,
        h = L.height;
      x.save();
      for (let i = 1; i <= 6; i++) {
        const sc = 1 + i * 0.012 * k * 3;
        x.globalAlpha = 0.18;
        x.drawImage(src, (w - w * sc) / 2, (h - h * sc) / 2, w * sc, h * sc);
      }
      x.restore();
    },
  },
  {
    id: "vhs",
    name: "VHS",
    group: "Retro",
    apply: (L, k, t, s) => {
      rgbSplit(L, 5 * k * s + 1);
      if (rand(Math.floor(t * 8)) < 0.3) slices(L, Math.floor(t * 8), 2, 20 * k * s);
      maskedOverlay(L, "multiply", 0.35 * k, (x, w, h) => {
        x.fillStyle = "#fff";
        x.fillRect(0, 0, w, h);
        x.fillStyle = "#000";
        const step = Math.max(2, Math.round(3 * s));
        for (let y = 0; y < h; y += step) x.fillRect(0, y, w, Math.max(1, step / 3));
      });
      grain(L, 0.35 * k, t);
    },
  },
  {
    id: "scanlines",
    name: "Scanlines",
    group: "Retro",
    apply: (L, k, _t, s) =>
      maskedOverlay(L, "multiply", 0.6 * k, (x, w, h) => {
        x.fillStyle = "#fff";
        x.fillRect(0, 0, w, h);
        x.fillStyle = "#000";
        const step = Math.max(2, Math.round(4 * s));
        for (let y = 0; y < h; y += step) x.fillRect(0, y, w, step / 2);
      }),
  },
  {
    id: "posterize",
    name: "Posterize",
    group: "Retro",
    apply: (L, k) => {
      const lv = Math.max(2, Math.round(10 - k * 8));
      const q = 255 / (lv - 1);
      pixelOp(L, (d, i) => {
        d[i] = Math.round(d[i]! / q) * q;
        d[i + 1] = Math.round(d[i + 1]! / q) * q;
        d[i + 2] = Math.round(d[i + 2]! / q) * q;
      });
    },
  },
  {
    id: "duotone",
    name: "Duotone",
    group: "Retro",
    apply: (L, k) =>
      pixelOp(L, (d, i) => {
        const l = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255;
        const r = 40 + l * 215,
          g = 20 + l * 120,
          b = 120 + l * 60;
        d[i] = d[i]! + (r - d[i]!) * k;
        d[i + 1] = d[i + 1]! + (g - d[i + 1]!) * k;
        d[i + 2] = d[i + 2]! + (b - d[i + 2]!) * k;
      }),
  },
  {
    id: "ink",
    name: "Comic ink",
    group: "Retro",
    apply: (L, k) =>
      pixelOp(L, (d, i) => {
        const l = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        const v = l > 140 - k * 40 ? 255 : l > 70 ? 128 : 0;
        d[i] = d[i]! + (v - d[i]!) * k;
        d[i + 1] = d[i + 1]! + (v - d[i + 1]!) * k;
        d[i + 2] = d[i + 2]! + (v - d[i + 2]!) * k;
      }),
  },
  {
    id: "light-leak",
    name: "Light leak",
    group: "Lens",
    apply: (L, k, t) =>
      maskedOverlay(L, "screen", k, (x, w, h) => {
        const cx = w * (0.5 + 0.45 * Math.sin(t * 0.7)),
          cy = h * (0.3 + 0.2 * Math.cos(t * 0.5));
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
        g.addColorStop(0, "rgba(255,170,60,0.9)");
        g.addColorStop(0.5, "rgba(255,60,90,0.35)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      }),
  },
  {
    id: "flash",
    name: "Flash",
    group: "Party",
    apply: (L, k, t) => {
      const a = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 8) * k;
      if (a > 0.01)
        maskedOverlay(
          L,
          "lighter",
          a,
          (x, w, h) => ((x.fillStyle = "#fff"), x.fillRect(0, 0, w, h)),
        );
    },
  },
  {
    id: "strobe",
    name: "Strobe",
    group: "Party",
    apply: (L, k, t) => {
      if (Math.floor(t * 8) % 2 === 0)
        maskedOverlay(
          L,
          "source-over",
          0.8 * k,
          (x, w, h) => ((x.fillStyle = "#fff"), x.fillRect(0, 0, w, h)),
        );
    },
  },
  {
    id: "rainbow",
    name: "Rainbow",
    group: "Party",
    apply: (L, k, t) => {
      const h = (t * 120) % 360;
      maskedOverlay(
        L,
        "color",
        0.6 * k,
        (x, w, hh) => ((x.fillStyle = `hsl(${h},100%,50%)`), x.fillRect(0, 0, w, hh)),
      );
    },
  },
  {
    id: "shake",
    name: "Shake",
    group: "Party",
    post: (k, t, s) => ({
      dx: (rand(Math.floor(t * 30)) - 0.5) * 40 * k * s,
      dy: (rand(Math.floor(t * 30) + 3) - 0.5) * 40 * k * s,
    }),
  },
  {
    id: "pulse",
    name: "Zoom pulse",
    group: "Party",
    post: (k, t) => ({ scale: 1 + 0.12 * k * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 4) }),
  },
  {
    id: "heartbeat",
    name: "Heartbeat",
    group: "Party",
    post: (k, t) => ({
      scale: 1 + 0.08 * k * (Math.abs(Math.sin(t * Math.PI * 1.6)) > 0.9 ? 1 : 0.3),
    }),
  },
  {
    id: "swing",
    name: "Swing",
    group: "Party",
    post: (k, t) => ({ rotation: Math.sin(t * Math.PI) * 8 * k }),
  },
  // ---------- camera movement (Motion): ramped against the block's own duration ----------
  {
    id: "zoom-in",
    name: "Zoom in",
    group: "Motion",
    post: (k, _t, _s, p) => ({ scale: 1 + 0.6 * k * (p ?? 0.5) }),
  },
  {
    id: "zoom-out",
    name: "Zoom out",
    group: "Motion",
    post: (k, _t, _s, p) => ({ scale: 1 + 0.6 * k * (1 - (p ?? 0.5)) }),
  },
  {
    id: "punch-in",
    name: "Punch in",
    group: "Motion",
    post: (k, t) => ({
      scale: 1 + 0.35 * k * Math.pow(Math.max(0, Math.sin(t * Math.PI * 0.9)), 12),
    }),
  },
  {
    id: "spin-zoom",
    name: "Spin zoom",
    group: "Motion",
    post: (k, _t, _s, p) => {
      const q = p ?? 0.5;
      return { scale: 1 + 0.5 * k * q, rotation: (1 - q) * 26 * k };
    },
  },
  {
    id: "cam-drift",
    name: "Cam drift",
    group: "Motion",
    post: (k, _t, s, p) => {
      const q = p ?? 0.5;
      return { scale: 1 + 0.24 * k * q, dx: (q - 0.5) * 110 * k * s, dy: (0.5 - q) * 70 * k * s };
    },
  },
  {
    id: "vertigo",
    name: "Vertigo zoom",
    group: "Motion",
    apply: (L, k, _t, s, p) => blurInPlace(L, (0.3 + 1.4 * (p ?? 0.5)) * 16 * k * s),
    post: (k, _t, _s, p) => ({ scale: 1 + 0.55 * k * (p ?? 0.5) }),
  },
  {
    id: "swirl",
    name: "Swirl",
    group: "Distort",
    apply: (L, k, t) => {
      const src = copyOf(L, "fx-swirl");
      clear(L);
      const x = ctx2d(L);
      const w = L.width,
        h = L.height;
      const R = Math.hypot(w, h) / 2;
      const rings = 12;
      // drawing outer disc first and rotating inner ones more leaves a continuous twist
      const twist = k * (1.4 + 0.4 * Math.sin(t * 0.7));
      for (let i = rings; i >= 1; i--) {
        const a = twist * (1 - i / rings) * 2.2;
        x.save();
        x.beginPath();
        x.arc(w / 2, h / 2, (R * i) / rings, 0, Math.PI * 2);
        x.clip();
        x.translate(w / 2, h / 2);
        x.rotate(a);
        x.translate(-w / 2, -h / 2);
        x.drawImage(src, 0, 0);
        x.restore();
      }
    },
  },
  {
    id: "mirror",
    name: "Mirror",
    group: "Split",
    apply: (L, k) => {
      const src = copyOf(L, "fx-mirror");
      const x = ctx2d(L);
      const w = L.width,
        h = L.height;
      x.save();
      x.clearRect(w / 2, 0, w / 2, h);
      x.translate(w, 0);
      x.scale(-1, 1);
      x.drawImage(src, 0, 0, w / 2, h, 0, 0, w / 2, h);
      x.restore();
      if (k < 1) {
        x.save();
        x.globalAlpha = 1 - k;
        x.drawImage(src, 0, 0);
        x.restore();
      }
    },
  },
  {
    id: "kaleido",
    name: "Kaleidoscope",
    group: "Split",
    apply: (L, k) => {
      const src = copyOf(L, "fx-k");
      clear(L);
      const x = ctx2d(L);
      const w = L.width,
        h = L.height;
      const q: [number, number][] = [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ];
      for (const [sx, sy] of q) {
        x.save();
        x.translate(w / 2, h / 2);
        x.scale(sx, sy);
        x.drawImage(src, w / 4, h / 4, w / 2, h / 2, -w / 2, -h / 2, w / 2, h / 2);
        x.restore();
      }
      if (k < 1) {
        x.save();
        x.globalAlpha = 1 - k;
        x.drawImage(src, 0, 0);
        x.restore();
      }
    },
  },
  {
    id: "split-2",
    name: "Split 2",
    group: "Split",
    apply: (L, k) => {
      const src = copyOf(L, "fx-s2");
      clear(L);
      const x = ctx2d(L);
      const w = L.width,
        h = L.height;
      x.drawImage(src, w / 4, 0, w / 2, h, 0, 0, w / 2, h);
      x.drawImage(src, w / 4, 0, w / 2, h, w / 2, 0, w / 2, h);
      if (k < 1) {
        x.save();
        x.globalAlpha = 1 - k;
        x.drawImage(src, 0, 0);
        x.restore();
      }
    },
  },
  {
    id: "split-4",
    name: "Split 4",
    group: "Split",
    apply: (L, k) => {
      const src = copyOf(L, "fx-s4");
      clear(L);
      const x = ctx2d(L);
      const w = L.width,
        h = L.height;
      for (let i = 0; i < 4; i++)
        x.drawImage(src, (i % 2) * (w / 2), Math.floor(i / 2) * (h / 2), w / 2, h / 2);
      if (k < 1) {
        x.save();
        x.globalAlpha = 1 - k;
        x.drawImage(src, 0, 0);
        x.restore();
      }
    },
  },
  {
    id: "letterbox",
    name: "Cinema bars",
    group: "Lens",
    apply: (L, k) => {
      const x = ctx2d(L);
      const b = L.height * 0.13 * k;
      x.fillStyle = "#000";
      x.fillRect(0, 0, L.width, b);
      x.fillRect(0, L.height - b, L.width, b);
    },
  },
  {
    id: "snow",
    name: "Snow",
    group: "Nature",
    apply: (L, k, t, s) =>
      particles(
        L,
        t,
        Math.round(40 + 160 * k),
        (x, px, py, i, sc) => {
          x.fillStyle = "rgba(255,255,255,0.85)";
          x.beginPath();
          x.arc(px, py, (1.5 + rand(i + 7) * 3.5) * sc, 0, Math.PI * 2);
          x.fill();
        },
        80,
        s,
      ),
  },
  {
    id: "rain",
    name: "Rain",
    group: "Nature",
    apply: (L, k, t, s) =>
      particles(
        L,
        t,
        Math.round(60 + 240 * k),
        (x, px, py, _i, sc) => {
          x.strokeStyle = "rgba(200,220,255,0.55)";
          x.lineWidth = 1.5 * sc;
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(px - 4 * sc, py + 26 * sc);
          x.stroke();
        },
        900,
        s,
      ),
  },
  {
    id: "confetti",
    name: "Confetti",
    group: "Party",
    apply: (L, k, t, s) =>
      particles(
        L,
        t,
        Math.round(30 + 120 * k),
        (x, px, py, i, sc) => {
          x.save();
          x.translate(px, py);
          x.rotate(t * 3 + i);
          x.fillStyle = `hsl(${Math.floor(rand(i + 3) * 360)},90%,60%)`;
          x.fillRect(-5 * sc, -3 * sc, 10 * sc, 6 * sc);
          x.restore();
        },
        200,
        s,
      ),
  },
  {
    id: "sparkle",
    name: "Sparkles",
    group: "Party",
    apply: (L, k, t, s) => {
      const x = ctx2d(L);
      const n = Math.round(15 + 50 * k);
      for (let i = 0; i < n; i++) {
        const tw = Math.max(0, Math.sin(t * 4 + i * 1.7));
        if (tw < 0.2) continue;
        const px = rand(i + 11) * L.width,
          py = rand(i + 51) * L.height,
          r = (4 + rand(i) * 10) * s * tw;
        x.fillStyle = `rgba(255,255,220,${tw})`;
        x.beginPath();
        x.moveTo(px, py - r);
        x.lineTo(px + r * 0.25, py);
        x.lineTo(px, py + r);
        x.lineTo(px - r * 0.25, py);
        x.closePath();
        x.moveTo(px - r, py);
        x.lineTo(px, py + r * 0.25);
        x.lineTo(px + r, py);
        x.lineTo(px, py - r * 0.25);
        x.closePath();
        x.fill();
      }
    },
  },
  {
    id: "hearts",
    name: "Hearts",
    group: "Party",
    apply: (L, k, t, s) =>
      particles(
        L,
        -t,
        Math.round(10 + 40 * k),
        (x, px, py, i, sc) => {
          x.fillStyle = `rgba(255,${60 + Math.floor(rand(i) * 80)},120,0.85)`;
          x.font = `${Math.round((18 + rand(i + 2) * 22) * sc)}px sans-serif`;
          x.fillText("♥", px, py);
        },
        120,
        s,
      ),
  },
  {
    id: "petals",
    name: "Into Petals",
    group: "Nature",
    apply: (L, k, t, s) =>
      particles(
        L,
        t,
        Math.round(25 + k * 75),
        (x, px, py, i, sc) => {
          x.save();
          x.translate(px, py);
          x.rotate(i + t * 2);
          x.fillStyle = `rgba(255,${140 + Math.round(rand(i) * 80)},200,0.8)`;
          x.beginPath();
          x.ellipse(0, 0, 9 * sc, 4 * sc, 0, 0, Math.PI * 2);
          x.fill();
          x.restore();
        },
        90,
        s,
      ),
  },
  {
    id: "frame-smoke",
    name: "Frame Smoke",
    group: "Lens",
    apply: (L, k, t) =>
      maskedOverlay(L, "screen", k, (x, w, h) => {
        for (let i = 0; i < 20; i++) {
          const side = i % 4;
          const px = side < 2 ? (side === 0 ? 0 : w) : rand(i) * w;
          const py = side >= 2 ? (side === 2 ? 0 : h) : rand(i) * h;
          const r = Math.min(w, h) * (0.13 + rand(i) * 0.14) * (1 + Math.sin(t + i) * 0.2);
          const g = x.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, "rgba(210,210,230,0.6)");
          g.addColorStop(1, "rgba(210,210,230,0)");
          x.fillStyle = g;
          x.fillRect(px - r, py - r, r * 2, r * 2);
        }
      }),
  },
  {
    id: "halftone",
    name: "Halftone",
    group: "Retro",
    apply: (L, k, _t, s) => {
      const src = copyOf(L, "fx-halftone");
      const si = ctx2d(src).getImageData(0, 0, src.width, src.height).data;
      clear(L);
      const cx = ctx2d(L);
      const cell = Math.max(3, Math.round(6 * s));
      for (let y = 0; y < L.height; y += cell)
        for (let xp = 0; xp < L.width; xp += cell) {
          const idx = (y * L.width + xp) * 4;
          if (si[idx + 3]! < 40) continue;
          const lum = (0.299 * si[idx]! + 0.587 * si[idx + 1]! + 0.114 * si[idx + 2]!) / 255;
          const rr = (cell / 2) * (1 - lum) * (0.6 + 0.8 * k);
          if (rr < 0.4) continue;
          cx.fillStyle = `rgb(${si[idx]},${si[idx + 1]},${si[idx + 2]})`;
          cx.beginPath();
          cx.arc(xp + cell / 2, y + cell / 2, rr, 0, Math.PI * 2);
          cx.fill();
        }
    },
  },
  {
    id: "ripple",
    name: "Ripple",
    group: "Distort",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-ripple");
      clear(L);
      const x = ctx2d(L);
      const H = L.height,
        cy = H / 2,
        step = Math.max(2, Math.round(3 * s));
      for (let y = 0; y < H; y += step) {
        const dist = Math.abs(y - cy);
        const amp =
          Math.sin(dist / (24 * s) - t * 6) * 18 * k * s * Math.max(0, 1 - dist / (H * 0.7));
        x.drawImage(src, 0, y, L.width, step, amp, y, L.width, step);
      }
    },
  },
  {
    id: "echo",
    name: "Echo",
    group: "Distort",
    apply: (L, k, _t, s) => {
      const src = copyOf(L, "fx-echo");
      clear(L);
      const x = ctx2d(L);
      const gap = 26 * k * s + 6;
      for (let i = 3; i >= 1; i--) {
        x.save();
        x.globalAlpha = 0.5 * (1 - i / 4);
        x.drawImage(src, i * gap, 0);
        x.restore();
      }
      x.drawImage(src, 0, 0);
    },
  },
  {
    id: "motion-trail",
    name: "Motion Trail",
    group: "Lens",
    apply: (L, k, _t, s) => {
      const src = copyOf(L, "fx-trail");
      clear(L);
      const x = ctx2d(L);
      const n = 6,
        dx = (30 * k * s) / n;
      for (let i = 1; i < n; i++) {
        x.save();
        x.globalAlpha = 0.35 * (1 - i / n);
        x.drawImage(src, -i * dx, 0);
        x.restore();
      }
      x.drawImage(src, 0, 0);
    },
  },
  {
    id: "old-film",
    name: "Old Film",
    group: "Retro",
    apply: (L, k, t, s) => {
      grain(L, k * 0.5, t);
      const x = ctx2d(L);
      const seed = Math.floor(t * 20);
      x.save();
      x.globalAlpha = 0.5 * k;
      x.strokeStyle = "#fff";
      for (let i = 0; i < 3; i++)
        if (rand(seed + i) > 0.6) {
          const sx = Math.floor(rand(seed + i + 9) * L.width);
          x.beginPath();
          x.moveTo(sx, 0);
          x.lineTo(sx + (rand(i) * 6 - 3), L.height);
          x.lineWidth = Math.max(1, 1.5 * s);
          x.stroke();
        }
      x.restore();
      x.save();
      x.globalCompositeOperation = "overlay";
      x.globalAlpha = 0.12 * k * (0.5 + rand(seed) / 2);
      x.fillStyle = rand(seed) > 0.5 ? "#fff" : "#000";
      x.fillRect(0, 0, L.width, L.height);
      x.restore();
      vignette(L, 0.5 * k);
    },
  },
  {
    id: "tv-static",
    name: "TV Static",
    group: "Retro",
    apply: (L, k, t, s) => {
      const x = ctx2d(L);
      const img = x.getImageData(0, 0, L.width, L.height);
      const d = img.data;
      const frame = Math.floor(t * 30);
      const a = k * 0.5;
      const bs = Math.max(1, Math.round(4 * s));
      for (let y = 0; y < L.height; y++)
        for (let xp = 0; xp < L.width; xp++) {
          const i = (y * L.width + xp) * 4;
          if (d[i + 3] === 0) continue;
          const v = rand(Math.floor(xp / bs) + Math.floor(y / bs) * 997 + frame) * 255;
          d[i] = d[i]! + (v - d[i]!) * a;
          d[i + 1] = d[i + 1]! + (v - d[i + 1]!) * a;
          d[i + 2] = d[i + 2]! + (v - d[i + 2]!) * a;
        }
      x.putImageData(img, 0, 0);
    },
  },
  {
    id: "bubbles",
    name: "Bubbles",
    group: "Party",
    apply: (L, k, t, s) =>
      particles(
        L,
        -t,
        Math.round(12 + 50 * k),
        (x, px, py, i, sc) => {
          const r = (5 + rand(i) * 14) * sc;
          x.beginPath();
          x.arc(px, py, r, 0, Math.PI * 2);
          x.fillStyle = "rgba(180,220,255,0.18)";
          x.fill();
          x.strokeStyle = "rgba(255,255,255,0.7)";
          x.lineWidth = 1.5 * sc;
          x.stroke();
          x.beginPath();
          x.arc(px - r * 0.3, py - r * 0.3, r * 0.25, 0, Math.PI * 2);
          x.fillStyle = "rgba(255,255,255,0.6)";
          x.fill();
        },
        160,
        s,
      ),
  },
  {
    id: "dust",
    name: "Dust Motes",
    group: "Nature",
    apply: (L, k, t, s) =>
      particles(
        L,
        t,
        Math.round(20 + 70 * k),
        (x, px, py, i, sc) => {
          x.fillStyle = `rgba(255,250,230,${0.25 + rand(i + 3) * 0.4})`;
          x.beginPath();
          x.arc(px, py, (1 + rand(i) * 2.5) * sc, 0, Math.PI * 2);
          x.fill();
        },
        30,
        s,
      ),
  },
  {
    id: "fireflies",
    name: "Fireflies",
    group: "Nature",
    apply: (L, k, t, s) => {
      const x = ctx2d(L);
      const n = Math.round(8 + 30 * k);
      for (let i = 0; i < n; i++) {
        const blink = Math.max(0, Math.sin(t * 2 + i * 1.7));
        if (blink < 0.2) continue;
        const px = (rand(i) * L.width + Math.sin(t * 0.6 + i) * 30 * s + L.width) % L.width;
        const py = rand(i + 200) * L.height + Math.cos(t * 0.5 + i) * 20 * s;
        const r = (3 + rand(i + 5) * 4) * s * blink * 3;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(255,240,150,${blink})`);
        g.addColorStop(1, "rgba(255,240,150,0)");
        x.fillStyle = g;
        x.beginPath();
        x.arc(px, py, r, 0, Math.PI * 2);
        x.fill();
      }
    },
  },
  {
    id: "bokeh",
    name: "Bokeh",
    group: "Lens",
    apply: (L, k, t, s) =>
      particles(
        L,
        t,
        Math.round(8 + 20 * k),
        (x, px, py, i, sc) => {
          const r = (24 + rand(i) * 60) * sc;
          const hue = Math.floor(rand(i + 2) * 360);
          const g = x.createRadialGradient(px, py, r * 0.2, px, py, r);
          g.addColorStop(0, `hsla(${hue},70%,70%,0.35)`);
          g.addColorStop(1, `hsla(${hue},70%,70%,0)`);
          x.fillStyle = g;
          x.beginPath();
          x.arc(px, py, r, 0, Math.PI * 2);
          x.fill();
        },
        20,
        s,
      ),
  },
  // ---------- Light & lens ----------
  {
    id: "sun-rays",
    name: "Sun Rays",
    group: "Light",
    apply: (L, k, t) =>
      maskedOverlay(L, "lighter", k, (x, w, h) => {
        const cx = w * (0.5 + 0.35 * Math.cos(t * 0.3)),
          cy = h * 0.22,
          len = Math.hypot(w, h);
        x.save();
        x.translate(cx, cy);
        x.rotate(t * 0.12);
        for (let i = 0; i < 12; i++) {
          x.rotate(Math.PI / 6);
          const g = x.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, "rgba(255,232,170,0.55)");
          g.addColorStop(1, "rgba(255,232,170,0)");
          x.fillStyle = g;
          x.beginPath();
          x.moveTo(0, 0);
          x.lineTo(len, -len * 0.03);
          x.lineTo(len, len * 0.03);
          x.closePath();
          x.fill();
        }
        x.restore();
      }),
  },
  {
    id: "bloom",
    name: "Bloom",
    group: "Light",
    apply: (L, k, _t, s) => {
      const c = copyOf(L, "fx-bloom");
      blurInPlace(c, 26 * s);
      const x = ctx2d(L);
      x.save();
      x.globalCompositeOperation = "screen";
      x.globalAlpha = k * 0.9;
      x.drawImage(c, 0, 0);
      x.restore();
    },
  },
  {
    id: "glare",
    name: "Anamorphic Glare",
    group: "Light",
    apply: (L, k, t, s) =>
      maskedOverlay(L, "lighter", k, (x, w, h) => {
        const cy = h * 0.45;
        const g = x.createLinearGradient(0, cy, w, cy);
        const a = 0.4 + 0.3 * Math.sin(t * 2);
        g.addColorStop(0, "rgba(80,140,255,0)");
        g.addColorStop(0.5, `rgba(180,210,255,${a})`);
        g.addColorStop(1, "rgba(80,140,255,0)");
        x.fillStyle = g;
        x.fillRect(0, cy - 3 * s, w, 6 * s);
      }),
  },
  {
    id: "light-sweep",
    name: "Light Sweep",
    group: "Light",
    apply: (L, k, t) =>
      maskedOverlay(L, "screen", k, (x, w, h) => {
        const p = (Math.sin(t * 1.2) + 1) / 2,
          gx = w * (p * 1.6 - 0.3);
        const g = x.createLinearGradient(gx - w * 0.2, 0, gx + w * 0.2, h);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255,0.5)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      }),
  },
  // ---------- Sparkle & particles ----------
  {
    id: "glitter",
    name: "Glitter",
    group: "Sparkle",
    apply: (L, k, t, s) => {
      const x = ctx2d(L);
      const n = Math.round(30 + 120 * k);
      x.save();
      for (let i = 0; i < n; i++) {
        const tw = Math.max(0, Math.sin(t * 5 + i * 2.3));
        if (tw < 0.15) continue;
        const px = rand(i + 3) * L.width,
          py = rand(i + 80) * L.height,
          r = (1 + rand(i) * 2) * s * tw * 4;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(255,240,180,${tw})`);
        g.addColorStop(1, "rgba(255,200,80,0)");
        x.fillStyle = g;
        x.beginPath();
        x.arc(px, py, r, 0, Math.PI * 2);
        x.fill();
      }
      x.restore();
    },
  },
  {
    id: "shimmer",
    name: "Shimmer",
    group: "Sparkle",
    apply: (L, k, t) =>
      maskedOverlay(L, "overlay", k * 0.5, (x, w, h) => {
        const o = (Math.sin(t * 1.5) + 1) / 2;
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(Math.max(0, o - 0.2), "rgba(255,255,255,0)");
        g.addColorStop(o, "rgba(255,255,255,0.6)");
        g.addColorStop(Math.min(1, o + 0.2), "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      }),
  },
  {
    id: "stardust",
    name: "Stardust",
    group: "Sparkle",
    apply: (L, k, t, s) =>
      particles(
        L,
        -t,
        Math.round(40 + 120 * k),
        (x, px, py, i, sc) => {
          x.fillStyle = `rgba(255,255,255,${0.3 + rand(i) * 0.5})`;
          x.beginPath();
          x.arc(px, py, (1 + rand(i + 2) * 2) * sc, 0, Math.PI * 2);
          x.fill();
        },
        120,
        s,
      ),
  },
  // ---------- Glitch & distortion ----------
  {
    id: "signal-error",
    name: "Signal Error",
    group: "Distort",
    apply: (L, k, t, s) => {
      rgbSplit(L, (8 + rand(Math.floor(t * 20)) * 20) * k * s);
      slices(L, Math.floor(t * 20), Math.round(6 + k * 14), 120 * k * s);
    },
  },
  {
    id: "chromatic-pulse",
    name: "Chromatic Pulse",
    group: "Distort",
    apply: (L, k, t, s) => rgbSplit(L, k * 20 * s * (0.5 + 0.5 * Math.sin(t * 3))),
  },
  {
    id: "digital-noise",
    name: "Digital Noise",
    group: "Distort",
    apply: (L, k, t, s) => {
      const x = ctx2d(L);
      const bs = Math.max(4, Math.round(16 * s));
      const frame = Math.floor(t * 24);
      for (let y = 0; y < L.height; y += bs)
        for (let xx = 0; xx < L.width; xx += bs)
          if (rand(xx * 13 + y * 7 + frame) > 0.9) {
            const dx = (rand(frame + y) - 0.5) * 40 * k * s;
            x.drawImage(L, xx, y, bs, bs, xx + dx, y, bs, bs);
          }
    },
  },
  // ---------- Motion & speed ----------
  {
    id: "speed-lines",
    name: "Speed Lines",
    group: "Motion",
    apply: (L, k, _t, s) =>
      maskedOverlay(L, "screen", k, (x, w, h) => {
        const cx = w / 2,
          cy = h / 2;
        for (let i = 0; i < 60; i++) {
          const a = rand(i) * Math.PI * 2,
            r0 = Math.hypot(w, h) * (0.25 + rand(i + 9) * 0.6);
          const g = x.createLinearGradient(cx, cy, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(1, `rgba(255,255,255,${0.3 + 0.4 * rand(i + 3)})`);
          x.strokeStyle = g;
          x.lineWidth = (1 + rand(i) * 2) * s;
          x.beginPath();
          x.moveTo(cx + Math.cos(a) * r0 * 0.4, cy + Math.sin(a) * r0 * 0.4);
          x.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          x.stroke();
        }
      }),
  },
  {
    id: "radial-blur",
    name: "Radial Blur",
    group: "Motion",
    apply: (L, k) => {
      const src = copyOf(L, "fx-rb");
      const x = ctx2d(L);
      const w = L.width,
        h = L.height;
      x.save();
      for (let i = 1; i <= 8; i++) {
        const sc = 1 + i * 0.02 * k * 3;
        x.globalAlpha = 0.14;
        x.drawImage(src, (w - w * sc) / 2, (h - h * sc) / 2, w * sc, h * sc);
      }
      x.restore();
    },
  },
  { id: "spin-move", name: "Spin", group: "Motion", post: (k, t) => ({ rotation: t * 90 * k }) },
  {
    id: "vert-trail",
    name: "Vertical Trail",
    group: "Motion",
    apply: (L, k, _t, s) => {
      const src = copyOf(L, "fx-vt");
      clear(L);
      const x = ctx2d(L);
      const n = 6,
        dy = (30 * k * s) / n;
      for (let i = 1; i < n; i++) {
        x.save();
        x.globalAlpha = 0.35 * (1 - i / n);
        x.drawImage(src, 0, -i * dy);
        x.restore();
      }
      x.drawImage(src, 0, 0);
    },
  },
  // ---------- Retro & film ----------
  {
    id: "eight-mm",
    name: "8mm Film",
    group: "Film",
    apply: (L, k, t) => {
      pixelOp(L, (d, i) => {
        const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        d[i] = d[i]! + (lum + 22 - d[i]!) * k * 0.6;
        d[i + 1] = d[i + 1]! + (lum * 0.92 + 8 - d[i + 1]!) * k * 0.6;
        d[i + 2] = d[i + 2]! + (lum * 0.7 - d[i + 2]!) * k * 0.6;
      });
      grain(L, k * 0.6, t);
      const flick = 0.85 + 0.15 * rand(Math.floor(t * 24));
      const x = ctx2d(L);
      x.save();
      x.globalCompositeOperation = "multiply";
      x.globalAlpha = 1 - flick;
      x.fillStyle = "#000";
      x.fillRect(0, 0, L.width, L.height);
      x.restore();
      vignette(L, 0.6 * k);
    },
  },
  {
    id: "camcorder",
    name: "Camcorder",
    group: "Film",
    apply: (L, k, t, s) => {
      grain(L, k * 0.3, t);
      const x = ctx2d(L);
      x.save();
      x.fillStyle = "rgba(255,255,255,0.85)";
      x.font = `${Math.round(L.height * 0.04)}px monospace`;
      const mm = String(Math.floor(t / 60) % 60).padStart(2, "0"),
        ss = String(Math.floor(t) % 60).padStart(2, "0"),
        ff = String(Math.floor((t * 30) % 30)).padStart(2, "0");
      x.fillText(`REC ${mm}:${ss}:${ff}`, L.width * 0.06, L.height * 0.11);
      if (Math.floor(t * 2) % 2 === 0) {
        x.fillStyle = "#ff3b3b";
        x.beginPath();
        x.arc(L.width * 0.04, L.height * 0.095, L.height * 0.012 * (s || 1), 0, Math.PI * 2);
        x.fill();
      }
      x.restore();
    },
  },
  {
    id: "dust-scratches",
    name: "Dust & Scratches",
    group: "Film",
    apply: (L, k, t, s) => {
      grain(L, k * 0.5, t);
      const x = ctx2d(L);
      x.save();
      x.globalAlpha = 0.6 * k;
      x.strokeStyle = "#fff";
      for (let i = 0; i < 6; i++)
        if (rand(Math.floor(t * 24) + i) > 0.5) {
          const sx = Math.floor(rand(i) * L.width);
          x.beginPath();
          x.moveTo(sx, 0);
          x.lineTo(sx + (rand(i + 1) * 10 - 5), L.height);
          x.lineWidth = Math.max(1, 1 * s);
          x.stroke();
        }
      x.restore();
    },
  },
  // ---------- Nature & weather ----------
  {
    id: "fog",
    name: "Fog",
    group: "Weather",
    apply: (L, k, t, s) =>
      maskedOverlay(L, "screen", k, (x, w, h) => {
        for (let i = 0; i < 14; i++) {
          const px = ((rand(i) * w + t * 20 * s * (0.5 + rand(i))) % (w + 200)) - 100,
            py = rand(i + 50) * h,
            r = Math.min(w, h) * (0.2 + rand(i + 9) * 0.2);
          const g = x.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, "rgba(220,225,235,0.5)");
          g.addColorStop(1, "rgba(220,225,235,0)");
          x.fillStyle = g;
          x.beginPath();
          x.arc(px, py, r, 0, Math.PI * 2);
          x.fill();
        }
      }),
  },
  {
    id: "mist",
    name: "Mist",
    group: "Weather",
    apply: (L, k, t, s) =>
      maskedOverlay(L, "screen", k * 0.7, (x, w, h) => {
        for (let i = 0; i < 8; i++) {
          const px = ((rand(i) * w - t * 15 * s) % (w + 160)) - 80,
            py = h * (0.5 + rand(i) * 0.4),
            r = Math.min(w, h) * 0.3;
          const g = x.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, "rgba(230,240,255,0.4)");
          g.addColorStop(1, "rgba(230,240,255,0)");
          x.fillStyle = g;
          x.fillRect(px - r, py - r, r * 2, r * 2);
        }
      }),
  },
  {
    id: "wind-eff",
    name: "Wind",
    group: "Weather",
    apply: (L, k, t, s) =>
      maskedOverlay(L, "screen", k * 0.6, (x, w, h) => {
        x.strokeStyle = "rgba(255,255,255,0.3)";
        for (let i = 0; i < 30; i++) {
          const y = rand(i) * h,
            x0 = ((rand(i + 3) * w + t * 400 * s) % (w + 200)) - 100,
            len = (30 + rand(i) * 80) * s;
          x.lineWidth = Math.max(1, 1.5 * s);
          x.beginPath();
          x.moveTo(x0, y);
          x.lineTo(x0 + len, y + len * 0.1);
          x.stroke();
        }
      }),
  },
  {
    id: "lightning",
    name: "Lightning",
    group: "Weather",
    apply: (L, k, t, s) => {
      const cycle = t % 1.6;
      if (cycle > 0.15) return;
      const a = ((0.15 - cycle) / 0.15) * k;
      maskedOverlay(L, "lighter", a, (x, w, h) => {
        x.fillStyle = "#fff";
        x.fillRect(0, 0, w, h);
      });
      const x = ctx2d(L);
      x.save();
      x.strokeStyle = `rgba(210,225,255,${a})`;
      x.lineWidth = 3 * s;
      let bx = L.width * (0.3 + rand(Math.floor(t)) * 0.4),
        by = 0;
      x.beginPath();
      x.moveTo(bx, by);
      while (by < L.height) {
        bx += (rand(by) - 0.5) * L.width * 0.15;
        by += L.height * 0.08;
        x.lineTo(bx, by);
      }
      x.stroke();
      x.restore();
    },
  },
  {
    id: "leaves",
    name: "Leaves",
    group: "Weather",
    apply: (L, k, t, s) =>
      particles(
        L,
        t,
        Math.round(15 + 50 * k),
        (x, px, py, i, sc) => {
          x.save();
          x.translate(px, py);
          x.rotate(i + t * 2);
          x.fillStyle = `rgba(${80 + Math.round(rand(i) * 100)},${150 + Math.round(rand(i + 1) * 60)},60,0.85)`;
          x.beginPath();
          x.ellipse(0, 0, 10 * sc, 5 * sc, 0, 0, Math.PI * 2);
          x.fill();
          x.restore();
        },
        100,
        s,
      ),
  },
  // ---------- Love & romantic ----------
  {
    id: "floating-hearts",
    name: "Floating Hearts",
    group: "Love",
    apply: (L, k, t, s) =>
      particles(
        L,
        -t,
        Math.round(15 + 50 * k),
        (x, px, py, i, sc) => {
          x.save();
          x.translate(px, py);
          const sz = (14 + rand(i) * 16) * sc;
          x.fillStyle = `rgba(255,${90 + Math.floor(rand(i + 2) * 80)},150,0.8)`;
          x.beginPath();
          x.moveTo(0, sz * 0.35);
          x.bezierCurveTo(-sz * 1.1, -sz * 0.35, -sz * 0.5, -sz * 1.05, 0, -sz * 0.45);
          x.bezierCurveTo(sz * 0.5, -sz * 1.05, sz * 1.1, -sz * 0.35, 0, sz * 0.35);
          x.fill();
          x.restore();
        },
        140,
        s,
      ),
  },
  {
    id: "pink-glow",
    name: "Pink Glow",
    group: "Love",
    apply: (L, k, _t, s) => {
      const c = copyOf(L, "fx-pg");
      blurInPlace(c, 16 * s);
      const x = ctx2d(L);
      x.save();
      x.globalCompositeOperation = "screen";
      x.globalAlpha = k * 0.6;
      x.drawImage(c, 0, 0);
      x.restore();
      maskedOverlay(L, "overlay", k * 0.3, (x2, w, h) => {
        x2.fillStyle = "#ff9ecb";
        x2.fillRect(0, 0, w, h);
      });
    },
  },
  {
    id: "soft-focus",
    name: "Soft Focus",
    group: "Love",
    apply: (L, k, _t, s) => {
      const c = copyOf(L, "fx-sf");
      blurInPlace(c, 8 * k * s);
      const x = ctx2d(L);
      x.save();
      x.globalAlpha = 0.6;
      x.drawImage(c, 0, 0);
      x.restore();
    },
  },
  // ---------- Fire, energy & impact ----------
  {
    id: "fire",
    name: "Fire",
    group: "Energy",
    apply: (L, k, t, s) => {
      maskedOverlay(L, "screen", k * 0.3, (x, w, h) => {
        const g = x.createLinearGradient(0, h, 0, h * 0.4);
        g.addColorStop(0, "rgba(255,120,0,0.6)");
        g.addColorStop(1, "rgba(255,0,0,0)");
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      });
      particles(
        L,
        -t,
        Math.round(40 + 120 * k),
        (x, px, py, i, sc) => {
          const r = (2 + rand(i) * 4) * sc;
          const g = x.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, "rgba(255,220,120,0.9)");
          g.addColorStop(1, "rgba(255,80,0,0)");
          x.fillStyle = g;
          x.beginPath();
          x.arc(px, py, r, 0, Math.PI * 2);
          x.fill();
        },
        300,
        s,
      );
    },
  },
  {
    id: "embers",
    name: "Embers",
    group: "Energy",
    apply: (L, k, t, s) =>
      particles(
        L,
        -t,
        Math.round(30 + 100 * k),
        (x, px, py, i, sc) => {
          const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i));
          x.fillStyle = `rgba(255,${120 + Math.floor(rand(i) * 90)},30,${a})`;
          x.beginPath();
          x.arc(px, py, (1 + rand(i) * 2.5) * sc, 0, Math.PI * 2);
          x.fill();
        },
        200,
        s,
      ),
  },
  {
    id: "sparks-eff",
    name: "Sparks",
    group: "Energy",
    apply: (L, k, t, s) => {
      const x = ctx2d(L);
      x.save();
      x.strokeStyle = "rgba(255,240,150,0.9)";
      const cx = L.width / 2,
        cy = L.height * 0.6;
      for (let i = 0; i < Math.round(30 + 60 * k); i++) {
        const a = rand(i) * Math.PI * 2,
          life = (t * 2 + rand(i + 5)) % 1,
          r = life * Math.min(L.width, L.height) * 0.5;
        x.lineWidth = Math.max(1, (1 - life) * 2 * s);
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
        x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        x.stroke();
      }
      x.restore();
    },
  },
  {
    id: "explosion",
    name: "Explosion",
    group: "Energy",
    apply: (L, k, t) => {
      const cycle = t % 0.8;
      if (cycle > 0.5) return;
      const p = cycle / 0.5;
      maskedOverlay(L, "lighter", (1 - p) * k, (x, w, h) => {
        const cx = w / 2,
          cy = h / 2,
          r = Math.hypot(w, h) * p;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.4, "rgba(255,160,40,0.8)");
        g.addColorStop(1, "rgba(255,60,0,0)");
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.fill();
      });
    },
  },
  {
    id: "electric",
    name: "Electric",
    group: "Energy",
    apply: (L, k, t, s) => {
      const x = ctx2d(L);
      x.save();
      x.strokeStyle = `rgba(160,200,255,${0.5 + 0.5 * Math.sin(t * 10) * k})`;
      x.lineWidth = 2 * s;
      const seed = Math.floor(t * 20);
      for (let b = 0; b < 3; b++) {
        if (rand(seed + b) < 0.4) continue;
        let bx = rand(seed + b * 7) * L.width,
          by = 0;
        x.beginPath();
        x.moveTo(bx, by);
        while (by < L.height) {
          bx += (rand(bx + by) - 0.5) * 40 * s;
          by += L.height * 0.06;
          x.lineTo(bx, by);
        }
        x.stroke();
      }
      x.restore();
    },
  },
  // ---------- Dream & surreal ----------
  {
    id: "aura",
    name: "Aura",
    group: "Dream",
    apply: (L, k, t) =>
      maskedOverlay(L, "screen", k, (x, w, h) => {
        const cx = w / 2,
          cy = h / 2,
          r = Math.min(w, h) * (0.35 + 0.05 * Math.sin(t * 2)),
          hue = (t * 60) % 360;
        for (let i = 0; i < 3; i++) {
          const g = x.createRadialGradient(
            cx,
            cy,
            r * (0.6 + i * 0.15),
            cx,
            cy,
            r * (0.9 + i * 0.2),
          );
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(0.5, `hsla(${(hue + i * 40) % 360},90%,60%,0.4)`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          x.fillStyle = g;
          x.fillRect(0, 0, w, h);
        }
      }),
  },
  {
    id: "ethereal",
    name: "Ethereal",
    group: "Dream",
    apply: (L, k, _t, s) => {
      const src = copyOf(L, "fx-eth");
      const x = ctx2d(L);
      const off = 10 * s;
      x.save();
      x.globalCompositeOperation = "screen";
      x.globalAlpha = 0.5 * k;
      x.drawImage(src, off, 0);
      x.drawImage(src, -off, 0);
      x.restore();
    },
  },
  {
    id: "hologram",
    name: "Hologram",
    group: "Dream",
    apply: (L, k, t, s) => {
      pixelOp(L, (d, i) => {
        d[i] = d[i]! * 0.3;
        d[i + 1] = d[i + 1]! * 0.8 + 40;
        d[i + 2] = d[i + 2]! + 55;
      });
      maskedOverlay(L, "lighter", k * 0.3, (x, w, h) => {
        x.fillStyle = "rgba(0,200,255,0.12)";
        x.fillRect(0, 0, w, h);
        const step = Math.max(2, Math.round(4 * s));
        x.fillStyle = "rgba(0,255,255,0.2)";
        for (let y = Math.floor(t * 40) % step; y < h; y += step) x.fillRect(0, y, w, 1);
      });
    },
  },
  {
    id: "double-exposure",
    name: "Double Exposure",
    group: "Dream",
    apply: (L, k) => {
      const src = copyOf(L, "fx-de");
      const x = ctx2d(L);
      x.save();
      x.globalCompositeOperation = "screen";
      x.globalAlpha = 0.6 * k;
      x.translate(src.width, 0);
      x.scale(-1, 1);
      x.drawImage(src, 0, 0);
      x.restore();
    },
  },
  {
    id: "ghost-eff",
    name: "Ghost",
    group: "Dream",
    apply: (L, k, _t, s) => {
      const src = copyOf(L, "fx-gh");
      blurInPlace(src, 4 * k * s);
      clear(L);
      const x = ctx2d(L);
      for (let i = 0; i < 3; i++) {
        x.save();
        x.globalAlpha = (0.5 - i * 0.12) * k;
        x.drawImage(src, i * 8 * s, -i * 10 * s);
        x.restore();
      }
    },
  },
  {
    id: "displacement",
    name: "Displacement",
    group: "Dream",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-dsp");
      clear(L);
      const x = ctx2d(L);
      const H = L.height,
        cy = H / 2,
        step = Math.max(2, Math.round(3 * s));
      for (let y = 0; y < H; y += step) {
        const dy = cy - y;
        const amt =
          Math.sin(Math.abs(dy) / (30 * s) + t * 3) *
          30 *
          k *
          s *
          Math.exp(-Math.abs(dy) / (H * 0.4));
        x.drawImage(src, 0, y, L.width, step, amt, y, L.width, step);
      }
    },
  },
  {
    id: "portal",
    name: "Portal",
    group: "Dream",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-por");
      clear(L);
      const x = ctx2d(L);
      const W = L.width,
        H = L.height;
      x.save();
      x.translate(W / 2, H / 2);
      for (let i = 0; i < 8; i++) {
        x.save();
        x.rotate((i / 8) * Math.PI * 2 + t * 1.5);
        const sc = 1 - i * 0.05 * k;
        x.scale(sc, sc);
        x.globalAlpha = (1 - i / 8) * k * 0.5;
        x.drawImage(src, -W / 2, -H / 2);
        x.restore();
      }
      x.restore();
      x.globalAlpha = 1;
      x.drawImage(src, 0, 0);
    },
  },
  // ---------- Shadow & dramatic ----------
  {
    id: "silhouette",
    name: "Silhouette",
    group: "Drama",
    apply: (L, k) => {
      pixelOp(L, (d, i) => {
        const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        const v = lum > 90 ? 0 : 255;
        d[i] = d[i]! + (v - d[i]!) * k;
        d[i + 1] = d[i + 1]! + (v - d[i + 1]!) * k;
        d[i + 2] = d[i + 2]! + (v - d[i + 2]!) * k;
      });
    },
  },
  {
    id: "spotlight",
    name: "Spotlight",
    group: "Drama",
    apply: (L, k, t) =>
      maskedOverlay(L, "multiply", k, (x, w, h) => {
        const cx = w * (0.5 + 0.25 * Math.sin(t * 0.8)),
          cy = h * 0.5;
        const g = x.createRadialGradient(
          cx,
          cy,
          Math.min(w, h) * 0.1,
          cx,
          cy,
          Math.hypot(w, h) * 0.5,
        );
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(0,0,0,1)");
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      }),
  },
  {
    id: "noir-drama",
    name: "Noir",
    group: "Drama",
    apply: (L, k, t) => {
      pixelOp(L, (d, i) => {
        const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        const c = Math.max(0, Math.min(255, (lum - 128) * 1.6 + 128));
        for (let ch = 0; ch < 3; ch++) d[i + ch] = d[i + ch]! + (c - d[i + ch]!) * k;
      });
      vignette(L, 0.6 * k);
      if (rand(Math.floor(t * 24)) > 0.85)
        maskedOverlay(L, "lighter", 0.1 * k, (x, w, h) => {
          x.fillStyle = "#fff";
          x.fillRect(0, 0, w, h);
        });
    },
  },
  {
    id: "contrast-pop",
    name: "Contrast Pop",
    group: "Drama",
    apply: (L, k) => {
      pixelOp(L, (d, i) => {
        for (let c = 0; c < 3; c++) {
          const v = d[i + c]!;
          d[i + c] = v + ((v - 128) * 1.5 + 128 - v) * k;
        }
      });
    },
  },
  // ---------- Cartoon & artistic ----------
  {
    id: "sketch",
    name: "Sketch",
    group: "Art",
    apply: (L, k) => {
      const src = copyOf(L, "fx-sk");
      const si = ctx2d(src).getImageData(0, 0, src.width, src.height).data;
      const x = ctx2d(L);
      const img = x.getImageData(0, 0, L.width, L.height);
      const d = img.data;
      const W = L.width;
      for (let p = 0; p < d.length; p += 4) {
        const xx = (p / 4) % W,
          y = Math.floor(p / (4 * W));
        const lum = si[p]! * 0.299 + si[p + 1]! * 0.587 + si[p + 2]! * 0.114;
        if (xx < W - 1 && y < L.height - 1) {
          const lR = si[p + 4]! * 0.299 + si[p + 5]! * 0.587 + si[p + 6]! * 0.114;
          const lD =
            si[p + W * 4]! * 0.299 + si[p + W * 4 + 1]! * 0.587 + si[p + W * 4 + 2]! * 0.114;
          const v = 255 - Math.min(255, Math.abs(lum - lR) + Math.abs(lum - lD));
          for (let c = 0; c < 3; c++) d[p + c] = d[p + c]! + (v - d[p + c]!) * k;
        } else {
          for (let c = 0; c < 3; c++) d[p + c] = d[p + c]! + (255 - d[p + c]!) * k * 0.4;
        }
      }
      x.putImageData(img, 0, 0);
    },
  },
  {
    id: "oil-paint",
    name: "Oil Painting",
    group: "Art",
    apply: (L, k, _t, s) => {
      blurInPlace(L, 3 * k * s);
      pixelOp(L, (d, i) => {
        const q = 48;
        for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c]! / q) * q;
        const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        const sat = 1 + 0.3 * k;
        for (let c = 0; c < 3; c++) d[i + c] = lum + (d[i + c]! - lum) * sat;
      });
    },
  },
  {
    id: "pop-art",
    name: "Pop Art",
    group: "Art",
    apply: (L, k) => {
      pixelOp(L, (d, i) => {
        const q = 255 / 3;
        for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c]! / q) * q;
        const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!),
          mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
        if (mx - mn < 30) {
          const lum = d[i]! / 255;
          const r = 255 * Math.min(1, lum * 1.4);
          d[i] = d[i]! + (r - d[i]!) * k;
          d[i + 1] = d[i + 1]! + (40 - d[i + 1]!) * k;
          d[i + 2] = d[i + 2]! + (120 - d[i + 2]!) * k;
        }
      });
    },
  },
  {
    id: "cel-shade",
    name: "Cel Shade",
    group: "Art",
    apply: (L, k) => {
      pixelOp(L, (d, i) => {
        const q = 255 / 4;
        for (let c = 0; c < 3; c++) {
          const v = d[i + c]!;
          d[i + c] = v + (Math.round(v / q) * q - v) * k;
        }
      });
    },
  },
  // ---------- Split (multi-copy offsets across halves/quadrants/slices) ----------
  {
    id: "split-h",
    name: "Split Horizontal",
    group: "Split",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-split-h");
      const x = ctx2d(L);
      x.clearRect(0, 0, L.width, L.height);
      const off = Math.sin(t * 2.4) * 60 * k * s;
      x.drawImage(src, 0, 0, src.width, src.height / 2, -off, 0, L.width, L.height / 2);
      x.drawImage(
        src,
        0,
        src.height / 2,
        src.width,
        src.height / 2,
        off,
        L.height / 2,
        L.width,
        L.height / 2,
      );
    },
  },
  {
    id: "split-v",
    name: "Split Vertical",
    group: "Split",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-split-v");
      const x = ctx2d(L);
      x.clearRect(0, 0, L.width, L.height);
      const off = Math.sin(t * 2.1) * 60 * k * s;
      x.drawImage(src, 0, 0, src.width / 2, src.height, 0, -off, L.width / 2, L.height);
      x.drawImage(
        src,
        src.width / 2,
        0,
        src.width / 2,
        src.height,
        L.width / 2,
        off,
        L.width / 2,
        L.height,
      );
    },
  },
  {
    id: "split-cross",
    name: "Cross Split",
    group: "Split",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-split-x");
      const x = ctx2d(L);
      x.clearRect(0, 0, L.width, L.height);
      const off = Math.abs(Math.sin(t * 1.6)) * 40 * k * s;
      const hw = src.width / 2,
        hh = src.height / 2;
      x.drawImage(src, 0, 0, hw, hh, -off, -off, L.width / 2, L.height / 2);
      x.drawImage(src, hw, 0, hw, hh, off, -off, L.width / 2, L.height / 2);
      x.drawImage(src, 0, hh, hw, hh, -off, off, L.width / 2, L.height / 2);
      x.drawImage(src, hw, hh, hw, hh, off, off, L.width / 2, L.height / 2);
    },
  },
  {
    id: "split-3",
    name: "Triple Split",
    group: "Split",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-split-3");
      const x = ctx2d(L);
      x.clearRect(0, 0, L.width, L.height);
      const off = Math.sin(t * 2) * 80 * k * s;
      const tw = src.width / 3;
      x.drawImage(src, 0, 0, tw, src.height, off, 0, L.width / 3, L.height);
      x.drawImage(src, tw, 0, tw, src.height, L.width / 3 - off * 0.5, 0, L.width / 3, L.height);
      x.drawImage(
        src,
        tw * 2,
        0,
        tw,
        src.height,
        (L.width * 2) / 3 + off,
        0,
        L.width / 3,
        L.height,
      );
    },
  },
  {
    id: "split-wave",
    name: "Wave Split",
    group: "Split",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-split-w");
      const x = ctx2d(L);
      x.clearRect(0, 0, L.width, L.height);
      const rows = 12;
      const hRow = L.height / rows;
      for (let i = 0; i < rows; i++) {
        const dx = Math.sin(t * 2 + i * 0.6) * 30 * k * s;
        const sy = (src.height / rows) * i;
        x.drawImage(src, 0, sy, src.width, src.height / rows, dx, i * hRow, L.width, hRow + 1);
      }
    },
  },
  {
    id: "split-curtain",
    name: "Curtain Split",
    group: "Split",
    apply: (L, k, t, s) => {
      const src = copyOf(L, "fx-split-c");
      const x = ctx2d(L);
      x.clearRect(0, 0, L.width, L.height);
      const gap = Math.abs(Math.sin(t * 1.2)) * 80 * k * s;
      x.drawImage(src, 0, 0, src.width / 2, src.height, -gap, 0, L.width / 2, L.height);
      x.drawImage(
        src,
        src.width / 2,
        0,
        src.width / 2,
        src.height,
        L.width / 2 + gap,
        0,
        L.width / 2,
        L.height,
      );
      x.fillStyle = `rgba(0,0,0,${0.6 * k})`;
      x.fillRect(L.width / 2 - gap / 2, 0, gap, L.height);
    },
  },
];
export const effectById = (id: string) => EFFECTS.find((f) => f.id === id);

/** True when any of the tonal/detail sliders actually change pixels. */
function needsDetail(e: Effects): boolean {
  return (
    (e.highlights ?? 0) !== 0 ||
    (e.shadows ?? 0) !== 0 ||
    (e.whites ?? 0) !== 0 ||
    (e.blacks ?? 0) !== 0 ||
    (e.sharpen ?? 0) !== 0 ||
    (e.clarity ?? 0) !== 0 ||
    (e.vibrance ?? 0) !== 0 ||
    (e.grain ?? 0) !== 0 ||
    (e.fade ?? 0) !== 0
  );
}

/** Tonal range adjustments and a four-neighbor unsharp kernel over an RGBA buffer. */
let detailScratch: Uint8ClampedArray | null = null;
function detailInPlace(d: Uint8ClampedArray, w: number, h: number, e: Effects) {
  const hi = (e.highlights ?? 0) / 100;
  const sh = (e.shadows ?? 0) / 100;
  const whites = e.whites ?? 0;
  const blacks = e.blacks ?? 0;
  const edgeK = 2 * ((e.sharpen ?? 0) / 100) + (e.clarity ?? 0) / 25;
  const vib = (e.vibrance ?? 0) / 100;
  const grain = (e.grain ?? 0) * 0.8;
  const fade = (e.fade ?? 0) / 200;
  const hasTonal = hi !== 0 || sh !== 0 || whites !== 0 || blacks !== 0;
  const grainTable = grain !== 0 ? noiseValues() : null;
  const stride = w * 4;
  // neighbours must average the already color-processed pixels, so only snapshot when a kernel is
  // active; the snapshot is a pooled copy because allocating 0.9MB every frame stuttered playback
  let kernel: Uint8ClampedArray | null = null;
  if (edgeK !== 0) {
    if (!detailScratch || detailScratch.length !== d.length)
      detailScratch = new Uint8ClampedArray(d.length);
    kernel = detailScratch;
    kernel.set(d);
  }
  // every term below is optional, so the luma, the tint and the neighbour average are only computed
  // when a slider actually asks for them: most clips touch one or two of these
  for (let y = 0; y < h; y++) {
    const innerRow = kernel !== null && y > 0 && y < h - 1;
    const row = y * w;
    for (let xx = 0; xx < w; xx++) {
      const i = (row + xx) * 4;
      if (d[i + 3] === 0) continue;
      const r = d[i]!,
        g = d[i + 1]!,
        b = d[i + 2]!;
      let delta = 0,
        vibK = 0,
        lum255 = 0;
      if (hasTonal || vib !== 0) {
        const lum = (r * 0.213 + g * 0.715 + b * 0.072) / 255;
        if (vib !== 0) {
          const maxc = r > g ? (r > b ? r : b) : g > b ? g : b;
          const minc = r < g ? (r < b ? r : b) : g < b ? g : b;
          vibK = vib * (1 - (maxc - minc) / 255);
          lum255 = lum * 255;
        }
        if (hasTonal) {
          const l2 = lum * lum,
            i2 = (1 - lum) * (1 - lum);
          delta = 80 * (hi * l2 + sh * i2) + whites * l2 * l2 + blacks * i2 * i2;
        }
      }
      const noise = grainTable !== null ? (grainTable[(row + xx) & NOISE_MASK]! - 0.5) * grain : 0;
      let o0 = r + delta + (r - lum255) * vibK + noise;
      let o1 = g + delta + (g - lum255) * vibK + noise;
      let o2 = b + delta + (b - lum255) * vibK + noise;
      if (kernel !== null && innerRow && xx > 0 && xx < w - 1) {
        const k = kernel;
        o0 += edgeK * (r - (k[i - 4]! + k[i + 4]! + k[i - stride]! + k[i + stride]!) * 0.25);
        o1 +=
          edgeK * (g - (k[i - 3]! + k[i + 5]! + k[i - stride + 1]! + k[i + stride + 1]!) * 0.25);
        o2 +=
          edgeK * (b - (k[i - 2]! + k[i + 6]! + k[i - stride + 2]! + k[i + stride + 2]!) * 0.25);
      }
      if (fade !== 0) {
        o0 += (128 - o0) * fade;
        o1 += (128 - o1) * fade;
        o2 += (128 - o2) * fade;
      }
      d[i] = o0;
      d[i + 1] = o1;
      d[i + 2] = o2;
    }
  }
}

/**
 * The whole pointwise color stage in ONE read-back: matrix, then filter grade, then tonal
 * detail. Each stage used to round-trip the full frame through getImageData/putImageData,
 * which is what made adding a filter or an adjustment hitch.
 */
function applyColorPass(
  L: HTMLCanvasElement,
  m: Mat,
  grade: Grade | undefined,
  gradeIntensity: number,
  e: Effects,
) {
  const doMatrix = !isIdent(m);
  const doGrade = !!grade && gradeIntensity > 0;
  const doDetail = needsDetail(e);
  if (!doMatrix && !doGrade && !doDetail) return;
  // The matrix is a plain linear transform, so the GPU can do the whole frame in one blit; the
  // result is drawn back into the layer, which keeps the read-back the later stages need cheap.
  let matrixDone = false;
  if (doMatrix) {
    const tmp = poolCanvas("fx-matrix", L.width, L.height);
    if (matrixViaGpu(L, m, tmp)) {
      clear(L);
      ctx2d(L).drawImage(tmp, 0, 0);
      matrixDone = true;
    }
  }
  if (!doGrade && !doDetail) return;
  const x = ctx2d(L);
  const img = x.getImageData(0, 0, L.width, L.height);
  const d = img.data;
  if (doMatrix && !matrixDone) matrixInPlace(d, m);
  if (doGrade && grade) gradePixels(d, grade, gradeIntensity);
  if (doDetail) detailInPlace(d, L.width, L.height, e);
  x.putImageData(img, 0, 0);
}

// Original compound looks assembled from this engine's own effect primitives.
const COMPOUNDS: [string, string, FxDef["group"], string[]][] = [
  ["love-bubble", "Love Bubble", "Party", ["hearts", "glow"]],
  ["fireworks", "Fireworks", "Party", ["sparkle", "confetti", "flash"]],
  ["noise-2", "Noise 2", "Retro", ["grain", "rgb-split"]],
  ["bw-array", "BW Array", "Split", ["ink", "split-4"]],
  ["shake-flash", "Shake & Flash", "Party", ["shake", "flash"]],
  ["soft-wave", "Soft Wave", "Distort", ["wave", "glow"]],
  ["phantom", "Phantom", "Retro", ["duotone", "zoom-blur"]],
  ["neon-party", "Neon Party", "Party", ["rainbow", "rgb-split", "sparkle"]],
  ["winter-glow", "Winter Glow", "Nature", ["snow", "glow"]],
  ["storm", "Storm", "Nature", ["rain", "flash"]],
  ["retro-tv", "Retro TV", "Retro", ["vhs", "letterbox"]],
  ["prism", "Prism", "Split", ["kaleido", "rainbow"]],
];
for (const [id, name, group, ids] of COMPOUNDS) {
  const defs = ids.flatMap((key) => {
    const def = effectById(key);
    return def ? [def] : [];
  });
  EFFECTS.push({
    id,
    name,
    group,
    apply: (L, k, t, s, prog) => {
      for (const def of defs) def.apply?.(L, k, t, s, prog);
    },
    post: (k, t, s, prog) =>
      defs.reduce(
        (out, def) => {
          const p = def.post?.(k, t, s, prog);
          return {
            dx: out.dx + (p?.dx ?? 0),
            dy: out.dy + (p?.dy ?? 0),
            scale: out.scale * (p?.scale ?? 1),
            rotation: out.rotation + (p?.rotation ?? 0),
          };
        },
        { dx: 0, dy: 0, scale: 1, rotation: 0 },
      ),
  });
}

/** Apply a single effect reference to a layer in place; returns its post-transform contribution. */
export function applyFxToCanvas(
  L: HTMLCanvasElement,
  f: FxRef,
  t: number,
  s: number,
  dur?: number,
): PostTransform {
  const def = effectById(f.id);
  if (!def) return { dx: 0, dy: 0, scale: 1, rotation: 0 };
  const k = Math.max(0, Math.min(1, f.intensity / 100));
  if (k <= 0) return { dx: 0, dy: 0, scale: 1, rotation: 0 };
  const time = t * (f.speed ?? 1);
  const blend = Math.max(0, Math.min(1, (f.blend ?? 100) / 100));
  const prog = effectProgress(time, dur);
  const before = blend < 1 ? copyOf(L, "effect-blend") : null;
  def.apply?.(L, k, time, s, prog);
  if (before) {
    const processed = copyOf(L, "effect-blend-result");
    clear(L);
    const cx = ctx2d(L);
    cx.drawImage(before, 0, 0);
    cx.globalAlpha = blend;
    cx.drawImage(processed, 0, 0);
    cx.globalAlpha = 1;
  }
  const p = def.post?.(k * blend, time, s, prog);
  return { dx: p?.dx ?? 0, dy: p?.dy ?? 0, scale: p?.scale ?? 1, rotation: p?.rotation ?? 0 };
}

/** Apply a list of effects to a full-frame canvas in place, compositing the accumulated post-transform. */
export function applyGlobalFx(
  L: HTMLCanvasElement,
  fx: FxRef[],
  t: number,
  s: number,
  dur?: number,
) {
  let dx = 0,
    dy = 0,
    scale = 1,
    rotation = 0;
  for (const f of fx) {
    const p = applyFxToCanvas(L, f, t, s, dur);
    dx += p.dx;
    dy += p.dy;
    scale *= p.scale;
    rotation += p.rotation;
  }
  if (dx || dy || scale !== 1 || rotation) {
    const W = L.width,
      H = L.height;
    const tmp = poolCanvas("global-fx-post", W, H);
    clear(tmp);
    ctx2d(tmp).drawImage(L, 0, 0);
    clear(L);
    const x = ctx2d(L);
    x.save();
    x.translate(W / 2 + dx, H / 2 + dy);
    x.rotate((rotation * Math.PI) / 180);
    x.scale(scale, scale);
    x.drawImage(tmp, -W / 2, -H / 2);
    x.restore();
  }
}

/**
 * Grade a whole composited frame with one filter block: the same colour matrix + LUT path a clip
 * grade uses, with neutral adjustments so only the filter changes the picture. This is what makes
 * a Filters-lane block and a per-clip filter look identical in preview, gallery and export.
 */
export function gradeFrame(L: HTMLCanvasElement, filter: FilterRef) {
  const neutral = defaultEffects();
  const { m, vignette: vg } = clipColorMatrix(neutral, filter);
  const grade = filterById(filter.id)?.grade;
  try {
    applyColorPass(L, m, grade, Math.max(0, Math.min(1, filter.intensity / 100)), neutral);
    if (vg > 0) vignette(L, vg);
  } catch (e) {
    // a tainted canvas (media without CORS) can't be read back; keep rendering ungraded
    console.warn("grade skipped", e);
  }
}

/** Apply color + effects to a clip's layer; returns post transform for compositing. */
export function processLayer(
  L: HTMLCanvasElement,
  effects: Effects,
  filter: FilterRef | undefined,
  fx: FxRef[] | undefined,
  t: number,
  s: number,
  dur?: number,
): PostTransform {
  const post: PostTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
  const { m, vignette: vg } = clipColorMatrix(effects, filter);
  const grade = filter ? filterById(filter.id)?.grade : undefined;
  const gradeIntensity = filter ? Math.max(0, Math.min(1, filter.intensity / 100)) : 0;
  try {
    if (effects.blur > 0) blurInPlace(L, effects.blur * s);
    applyColorPass(L, m, grade, gradeIntensity, effects);
    if (vg > 0) vignette(L, vg);
    for (const f of fx ?? []) {
      const p = applyFxToCanvas(L, f, t, s, dur);
      post.dx += p.dx;
      post.dy += p.dy;
      post.scale *= p.scale;
      post.rotation += p.rotation;
    }
  } catch (e) {
    // a tainted canvas (media without CORS) can't be read back; keep rendering unprocessed
    console.warn("effect skipped", e);
  }
  return post;
}
