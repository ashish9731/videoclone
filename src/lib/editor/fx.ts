import { GENERATED_FILTERS, gradePixels, type Grade } from "./filter-gen";
/**
 * Color pipeline, filters (LUT-style presets) and video effects.
 * Everything renders with plain canvas 2D ops + pixel math so preview and export
 * look the same in every browser (ctx.filter is only used for blur when supported).
 */
import type { Effects, FilterRef, FxRef } from "./types";
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
    filterSupport = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
  return filterSupport;
}

/** Blur a canvas in place by `px`. */
export function blurInPlace(c: HTMLCanvasElement, px: number) {
  if (px < 0.3) return;
  const tmp = poolCanvas("blur-tmp", c.width, c.height);
  clear(tmp);
  const t = ctx2d(tmp);
  if (canvasFilterSupported()) {
    t.filter = `blur(${px}px)`;
    t.drawImage(c, 0, 0);
    t.filter = "none";
  } else {
    const f = Math.max(1, px / 2);
    const sw = Math.max(1, Math.round(c.width / f)), sh = Math.max(1, Math.round(c.height / f));
    const small = poolCanvas("blur-small", sw, sh);
    clear(small);
    const s = ctx2d(small);
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
    o[r * 4 + 3] = b[r * 4]! * a[3]! + b[r * 4 + 1]! * a[7]! + b[r * 4 + 2]! * a[11]! + b[r * 4 + 3]!;
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
  0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
  0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
  0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
];
const hue = (deg: number): Mat => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
  ];
};
const sepia = (a: number): Mat => {
  const k = 1 - a;
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0,
  ];
};
const invert = (a: number): Mat => {
  const d = 1 - 2 * a, o = a * 255;
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
  { id: "vivid", name: "Vivid", group: "Life", m: chain(saturate(1.45), contrast(1.12)), swatch: "linear-gradient(135deg,#ff5f6d,#ffc371)" },
  { id: "fresh", name: "Fresh", group: "Life", m: chain(brightness(1.06), saturate(1.2), temp(-15)), swatch: "linear-gradient(135deg,#a8e063,#56ab2f)" },
  { id: "warm", name: "Warm", group: "Life", m: chain(temp(45), saturate(1.1)), swatch: "linear-gradient(135deg,#f7971e,#ffd200)" },
  { id: "cool", name: "Cool", group: "Life", m: chain(temp(-45), saturate(0.95)), swatch: "linear-gradient(135deg,#2193b0,#6dd5ed)" },
  { id: "pastel", name: "Pastel", group: "Life", m: chain(saturate(0.7), contrast(0.85), brightness(1.12)), swatch: "linear-gradient(135deg,#fbc2eb,#a6c1ee)" },
  { id: "food", name: "Delicious", group: "Life", m: chain(saturate(1.3), temp(25), contrast(1.08)), swatch: "linear-gradient(135deg,#f12711,#f5af19)" },
  { id: "teal-orange", name: "Teal & Orange", group: "Movie", m: chain(gains(1.12, 1, 0.9), offset(6, 0, 10), mul(saturate(1.25), contrast(1.1)), hue(-6)), vignette: 0.3, swatch: "linear-gradient(135deg,#008080,#ff8c00)" },
  { id: "cinematic", name: "Cinematic", group: "Movie", m: chain(contrast(1.2), saturate(0.85), temp(-12), offset(0, 4, 10)), vignette: 0.45, swatch: "linear-gradient(135deg,#0f2027,#2c5364)" },
  { id: "bleach", name: "Bleach", group: "Movie", m: chain(saturate(0.45), contrast(1.35)), swatch: "linear-gradient(135deg,#8e9eab,#eef2f3)" },
  { id: "moody", name: "Moody", group: "Movie", m: chain(brightness(0.88), contrast(1.18), saturate(0.75), temp(-20)), vignette: 0.5, swatch: "linear-gradient(135deg,#232526,#414345)" },
  { id: "cyberpunk", name: "Cyberpunk", group: "Movie", m: chain(gains(1.1, 0.85, 1.25), offset(10, -5, 25), contrast(1.15), saturate(1.3)), swatch: "linear-gradient(135deg,#fc00ff,#00dbde)" },
  { id: "matrix", name: "Matrix", group: "Movie", m: chain(gains(0.75, 1.15, 0.75), contrast(1.15)), swatch: "linear-gradient(135deg,#000,#0f0)" },
  { id: "vintage", name: "Vintage", group: "Retro", m: chain(sepia(0.55), contrast(0.92), brightness(1.05), saturate(0.85)), vignette: 0.4, swatch: "linear-gradient(135deg,#c79081,#dfa579)" },
  { id: "film", name: "Kodak", group: "Retro", m: chain(temp(30), contrast(1.1), saturate(1.15), offset(8, 4, -6)), swatch: "linear-gradient(135deg,#e6b980,#eacda3)" },
  { id: "polaroid", name: "Polaroid", group: "Retro", m: chain(contrast(0.9), brightness(1.1), offset(10, 6, 0), saturate(0.9)), swatch: "linear-gradient(135deg,#ffefba,#ffffff)" },
  { id: "faded", name: "Faded", group: "Retro", m: chain(contrast(0.75), offset(18, 18, 22), saturate(0.8)), swatch: "linear-gradient(135deg,#bdc3c7,#2c3e50)" },
  { id: "sunset", name: "Sunset", group: "Retro", m: chain(gains(1.15, 0.95, 0.85), offset(10, 0, -5), saturate(1.2)), swatch: "linear-gradient(135deg,#ff7e5f,#feb47b)" },
  { id: "bw", name: "B&W", group: "Mono", m: chain(saturate(0)), swatch: "linear-gradient(135deg,#000,#fff)" },
  { id: "noir", name: "Noir", group: "Mono", m: chain(saturate(0), contrast(1.6), brightness(0.85)), vignette: 0.55, swatch: "linear-gradient(135deg,#000,#555)" },
  { id: "silver", name: "Silver", group: "Mono", m: chain(saturate(0), contrast(0.85), brightness(1.12)), swatch: "linear-gradient(135deg,#d7d2cc,#304352)" },
  { id: "sepia", name: "Sepia", group: "Mono", m: chain(sepia(1)), swatch: "linear-gradient(135deg,#704214,#c8a165)" },
  { id: "forest", name: "Forest", group: "Scenery", m: chain(gains(0.9, 1.1, 0.9), saturate(1.15), contrast(1.05)), swatch: "linear-gradient(135deg,#134e5e,#71b280)" },
  { id: "ocean", name: "Ocean", group: "Scenery", m: chain(gains(0.85, 1, 1.18), saturate(1.1)), swatch: "linear-gradient(135deg,#1a2980,#26d0ce)" },
  { id: "golden", name: "Golden hour", group: "Scenery", m: chain(temp(55), brightness(1.05), saturate(1.15)), swatch: "linear-gradient(135deg,#f2994a,#f2c94c)" },
  { id: "night", name: "Night", group: "Scenery", m: chain(brightness(0.8), temp(-50), saturate(0.8), contrast(1.1)), vignette: 0.5, swatch: "linear-gradient(135deg,#141e30,#243b55)" },
];
export const filterById = (id: string) => FILTERS.find((f) => f.id === id);

/** Final color matrix for a clip (adjustments, then filter at intensity). */
export function clipColorMatrix(e: Effects, f: FilterRef | undefined): { m: Mat; vignette: number } {
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

export function applyMatrix(c: HTMLCanvasElement, m: Mat) {
  const x = ctx2d(c);
  const img = x.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const [a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3] = m as [number, number, number, number, number, number, number, number, number, number, number, number];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    d[i] = a0 * r + a1 * g + a2 * b + a3;
    d[i + 1] = b0 * r + b1 * g + b2 * b + b3;
    d[i + 2] = c0 * r + c1 * g + c2 * b + c3;
  }
  x.putImageData(img, 0, 0);
}

// ---------- helpers ----------
export function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Composite something drawn by `draw` onto the layer, masked to the layer's own pixels. */
function maskedOverlay(L: HTMLCanvasElement, op: GlobalCompositeOperation, alpha: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) {
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
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
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
  const sw = Math.max(1, Math.ceil(L.width / size)), sh = Math.max(1, Math.ceil(L.height / size));
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
  const w = L.width, h = L.height;
  const src = x.getImageData(0, 0, w, h);
  const out = x.createImageData(w, h);
  const s = src.data, o = out.data;
  for (let y = 0; y < h; y++) {
    const yr = Math.min(h - 1, Math.max(0, y - dy)), yb = Math.min(h - 1, Math.max(0, y + dy));
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
    const ox = Math.floor(rand(Math.floor(t * 24)) * 256), oy = Math.floor(rand(Math.floor(t * 24) + 9) * 256);
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
  const w = L.width, h = L.height;
  x.save();
  for (let i = 0; i < n; i++) {
    const px = (rand(i) * w + Math.sin(t * 1.3 + i) * 12 * scale) % w;
    const py = ((rand(i + 500) * h + t * speed * scale * (0.6 + rand(i + 99) * 0.8)) % (h + 40 * scale)) - 20 * scale;
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
  group: "AI portrait" | "Basic" | "Distort" | "Retro" | "Party" | "Lens" | "Split" | "Nature";
  /** geometric jitter applied when compositing the layer */
  post?: (k: number, t: number, s: number) => Partial<PostTransform>;
  /** pixel/canvas operation on the layer; s = output px per 1080p unit */
  apply?: (L: HTMLCanvasElement, k: number, t: number, s: number) => void;
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
  { id: "pixelate", name: "Pixelate", group: "Distort", apply: (L, k, _t, s) => pixelate(L, (3 + k * 45) * s) },
  { id: "rgb-split", name: "RGB split", group: "Distort", apply: (L, k, t, s) => rgbSplit(L, k * 28 * s * (0.8 + 0.2 * Math.sin(t * 6))) },
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
      const w = L.width, h = L.height;
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
        const r = 40 + l * 215, g = 20 + l * 120, b = 120 + l * 60;
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
        const cx = w * (0.5 + 0.45 * Math.sin(t * 0.7)), cy = h * (0.3 + 0.2 * Math.cos(t * 0.5));
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
      if (a > 0.01) maskedOverlay(L, "lighter", a, (x, w, h) => ((x.fillStyle = "#fff"), x.fillRect(0, 0, w, h)));
    },
  },
  {
    id: "strobe",
    name: "Strobe",
    group: "Party",
    apply: (L, k, t) => {
      if (Math.floor(t * 8) % 2 === 0) maskedOverlay(L, "source-over", 0.8 * k, (x, w, h) => ((x.fillStyle = "#fff"), x.fillRect(0, 0, w, h)));
    },
  },
  {
    id: "rainbow",
    name: "Rainbow",
    group: "Party",
    apply: (L, k, t) => {
      const h = (t * 120) % 360;
      maskedOverlay(L, "color", 0.6 * k, (x, w, hh) => ((x.fillStyle = `hsl(${h},100%,50%)`), x.fillRect(0, 0, w, hh)));
    },
  },
  { id: "shake", name: "Shake", group: "Party", post: (k, t, s) => ({ dx: (rand(Math.floor(t * 30)) - 0.5) * 40 * k * s, dy: (rand(Math.floor(t * 30) + 3) - 0.5) * 40 * k * s }) },
  { id: "pulse", name: "Zoom pulse", group: "Party", post: (k, t) => ({ scale: 1 + 0.12 * k * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 4) }) },
  { id: "heartbeat", name: "Heartbeat", group: "Party", post: (k, t) => ({ scale: 1 + 0.08 * k * (Math.abs(Math.sin(t * Math.PI * 1.6)) > 0.9 ? 1 : 0.3) }) },
  { id: "swing", name: "Swing", group: "Party", post: (k, t) => ({ rotation: Math.sin(t * Math.PI) * 8 * k }) },
  {
    id: "mirror",
    name: "Mirror",
    group: "Split",
    apply: (L, k) => {
      const src = copyOf(L, "fx-mirror");
      const x = ctx2d(L);
      const w = L.width, h = L.height;
      x.save();
      x.clearRect(w / 2, 0, w / 2, h);
      x.translate(w, 0);
      x.scale(-1, 1);
      x.drawImage(src, 0, 0, w / 2, h, 0, 0, w / 2, h);
      x.restore();
      if (k < 1) { x.save(); x.globalAlpha = 1 - k; x.drawImage(src, 0, 0); x.restore(); }
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
      const w = L.width, h = L.height;
      const q: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (const [sx, sy] of q) {
        x.save();
        x.translate(w / 2, h / 2);
        x.scale(sx, sy);
        x.drawImage(src, w / 4, h / 4, w / 2, h / 2, -w / 2, -h / 2, w / 2, h / 2);
        x.restore();
      }
      if (k < 1) { x.save(); x.globalAlpha = 1 - k; x.drawImage(src, 0, 0); x.restore(); }
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
      const w = L.width, h = L.height;
      x.drawImage(src, w / 4, 0, w / 2, h, 0, 0, w / 2, h);
      x.drawImage(src, w / 4, 0, w / 2, h, w / 2, 0, w / 2, h);
      if (k < 1) { x.save(); x.globalAlpha = 1 - k; x.drawImage(src, 0, 0); x.restore(); }
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
      const w = L.width, h = L.height;
      for (let i = 0; i < 4; i++) x.drawImage(src, (i % 2) * (w / 2), Math.floor(i / 2) * (h / 2), w / 2, h / 2);
      if (k < 1) { x.save(); x.globalAlpha = 1 - k; x.drawImage(src, 0, 0); x.restore(); }
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
      particles(L, t, Math.round(40 + 160 * k), (x, px, py, i, sc) => {
        x.fillStyle = "rgba(255,255,255,0.85)";
        x.beginPath();
        x.arc(px, py, (1.5 + rand(i + 7) * 3.5) * sc, 0, Math.PI * 2);
        x.fill();
      }, 80, s),
  },
  {
    id: "rain",
    name: "Rain",
    group: "Nature",
    apply: (L, k, t, s) =>
      particles(L, t, Math.round(60 + 240 * k), (x, px, py, _i, sc) => {
        x.strokeStyle = "rgba(200,220,255,0.55)";
        x.lineWidth = 1.5 * sc;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px - 4 * sc, py + 26 * sc);
        x.stroke();
      }, 900, s),
  },
  {
    id: "confetti",
    name: "Confetti",
    group: "Party",
    apply: (L, k, t, s) =>
      particles(L, t, Math.round(30 + 120 * k), (x, px, py, i, sc) => {
        x.save();
        x.translate(px, py);
        x.rotate(t * 3 + i);
        x.fillStyle = `hsl(${Math.floor(rand(i + 3) * 360)},90%,60%)`;
        x.fillRect(-5 * sc, -3 * sc, 10 * sc, 6 * sc);
        x.restore();
      }, 200, s),
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
        const px = rand(i + 11) * L.width, py = rand(i + 51) * L.height, r = (4 + rand(i) * 10) * s * tw;
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
      particles(L, -t, Math.round(10 + 40 * k), (x, px, py, i, sc) => {
        x.fillStyle = `rgba(255,${60 + Math.floor(rand(i) * 80)},120,0.85)`;
        x.font = `${Math.round((18 + rand(i + 2) * 22) * sc)}px sans-serif`;
        x.fillText("♥", px, py);
      }, 120, s),
  },
  {
    id: 'petals', name: 'Into Petals', group: 'Nature',
    apply: (L, k, t, s) => particles(L, t, Math.round(25 + k * 75), (x, px, py, i, sc) => {
      x.save(); x.translate(px, py); x.rotate(i + t * 2); x.fillStyle = `rgba(255,${140 + Math.round(rand(i) * 80)},200,0.8)`; x.beginPath(); x.ellipse(0, 0, 9 * sc, 4 * sc, 0, 0, Math.PI * 2); x.fill(); x.restore();
    }, 90, s),
  },
  {
    id: 'frame-smoke', name: 'Frame Smoke', group: 'Lens',
    apply: (L, k, t) => maskedOverlay(L, 'screen', k, (x, w, h) => {
      for (let i = 0; i < 20; i++) {
        const side = i % 4;
        const px = side < 2 ? (side === 0 ? 0 : w) : rand(i) * w;
        const py = side >= 2 ? (side === 2 ? 0 : h) : rand(i) * h;
        const r = Math.min(w, h) * (0.13 + rand(i) * 0.14) * (1 + Math.sin(t + i) * 0.2);
        const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(210,210,230,0.6)'); g.addColorStop(1, 'rgba(210,210,230,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
      }
    }),
  },
  {
    id: 'halftone', name: 'Halftone', group: 'Retro',
    apply: (L, k, _t, s) => {
      const src = copyOf(L, 'fx-halftone');
      const si = ctx2d(src).getImageData(0, 0, src.width, src.height).data;
      clear(L);
      const cx = ctx2d(L);
      const cell = Math.max(3, Math.round(6 * s));
      for (let y = 0; y < L.height; y += cell) for (let xp = 0; xp < L.width; xp += cell) {
        const idx = (y * L.width + xp) * 4;
        if (si[idx + 3]! < 40) continue;
        const lum = (0.299 * si[idx]! + 0.587 * si[idx + 1]! + 0.114 * si[idx + 2]!) / 255;
        const rr = (cell / 2) * (1 - lum) * (0.6 + 0.8 * k);
        if (rr < 0.4) continue;
        cx.fillStyle = `rgb(${si[idx]},${si[idx + 1]},${si[idx + 2]})`;
        cx.beginPath(); cx.arc(xp + cell / 2, y + cell / 2, rr, 0, Math.PI * 2); cx.fill();
      }
    },
  },
  {
    id: 'ripple', name: 'Ripple', group: 'Distort',
    apply: (L, k, t, s) => {
      const src = copyOf(L, 'fx-ripple'); clear(L); const x = ctx2d(L);
      const H = L.height, cy = H / 2, step = Math.max(2, Math.round(3 * s));
      for (let y = 0; y < H; y += step) {
        const dist = Math.abs(y - cy);
        const amp = Math.sin(dist / (24 * s) - t * 6) * 18 * k * s * Math.max(0, 1 - dist / (H * 0.7));
        x.drawImage(src, 0, y, L.width, step, amp, y, L.width, step);
      }
    },
  },
  {
    id: 'echo', name: 'Echo', group: 'Distort',
    apply: (L, k, _t, s) => {
      const src = copyOf(L, 'fx-echo'); clear(L); const x = ctx2d(L);
      const gap = 26 * k * s + 6;
      for (let i = 3; i >= 1; i--) { x.save(); x.globalAlpha = 0.5 * (1 - i / 4); x.drawImage(src, i * gap, 0); x.restore(); }
      x.drawImage(src, 0, 0);
    },
  },
  {
    id: 'motion-trail', name: 'Motion Trail', group: 'Lens',
    apply: (L, k, _t, s) => {
      const src = copyOf(L, 'fx-trail'); clear(L); const x = ctx2d(L);
      const n = 6, dx = (30 * k * s) / n;
      for (let i = 1; i < n; i++) { x.save(); x.globalAlpha = 0.35 * (1 - i / n); x.drawImage(src, -i * dx, 0); x.restore(); }
      x.drawImage(src, 0, 0);
    },
  },
  {
    id: 'old-film', name: 'Old Film', group: 'Retro',
    apply: (L, k, t, s) => {
      grain(L, k * 0.5, t);
      const x = ctx2d(L); const seed = Math.floor(t * 20);
      x.save(); x.globalAlpha = 0.5 * k; x.strokeStyle = '#fff';
      for (let i = 0; i < 3; i++) if (rand(seed + i) > 0.6) { const sx = Math.floor(rand(seed + i + 9) * L.width); x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + (rand(i) * 6 - 3), L.height); x.lineWidth = Math.max(1, 1.5 * s); x.stroke(); }
      x.restore();
      x.save(); x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.12 * k * (0.5 + rand(seed) / 2); x.fillStyle = rand(seed) > 0.5 ? '#fff' : '#000'; x.fillRect(0, 0, L.width, L.height); x.restore();
      vignette(L, 0.5 * k);
    },
  },
  {
    id: 'tv-static', name: 'TV Static', group: 'Retro',
    apply: (L, k, t, s) => {
      const x = ctx2d(L); const img = x.getImageData(0, 0, L.width, L.height); const d = img.data;
      const frame = Math.floor(t * 30); const a = k * 0.5; const bs = Math.max(1, Math.round(4 * s));
      for (let y = 0; y < L.height; y++) for (let xp = 0; xp < L.width; xp++) {
        const i = (y * L.width + xp) * 4; if (d[i + 3] === 0) continue;
        const v = rand(Math.floor(xp / bs) + Math.floor(y / bs) * 997 + frame) * 255;
        d[i] = d[i]! + (v - d[i]!) * a; d[i + 1] = d[i + 1]! + (v - d[i + 1]!) * a; d[i + 2] = d[i + 2]! + (v - d[i + 2]!) * a;
      }
      x.putImageData(img, 0, 0);
    },
  },
  {
    id: 'bubbles', name: 'Bubbles', group: 'Party',
    apply: (L, k, t, s) => particles(L, -t, Math.round(12 + 50 * k), (x, px, py, i, sc) => {
      const r = (5 + rand(i) * 14) * sc;
      x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fillStyle = 'rgba(180,220,255,0.18)'; x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 1.5 * sc; x.stroke();
      x.beginPath(); x.arc(px - r * 0.3, py - r * 0.3, r * 0.25, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,0.6)'; x.fill();
    }, 160, s),
  },
  {
    id: 'dust', name: 'Dust Motes', group: 'Nature',
    apply: (L, k, t, s) => particles(L, t, Math.round(20 + 70 * k), (x, px, py, i, sc) => {
      x.fillStyle = `rgba(255,250,230,${0.25 + rand(i + 3) * 0.4})`;
      x.beginPath(); x.arc(px, py, (1 + rand(i) * 2.5) * sc, 0, Math.PI * 2); x.fill();
    }, 30, s),
  },
  {
    id: 'fireflies', name: 'Fireflies', group: 'Nature',
    apply: (L, k, t, s) => {
      const x = ctx2d(L); const n = Math.round(8 + 30 * k);
      for (let i = 0; i < n; i++) {
        const blink = Math.max(0, Math.sin(t * 2 + i * 1.7)); if (blink < 0.2) continue;
        const px = (rand(i) * L.width + Math.sin(t * 0.6 + i) * 30 * s + L.width) % L.width;
        const py = rand(i + 200) * L.height + Math.cos(t * 0.5 + i) * 20 * s;
        const r = (3 + rand(i + 5) * 4) * s * blink * 3;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(255,240,150,${blink})`); g.addColorStop(1, 'rgba(255,240,150,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      }
    },
  },
  {
    id: 'bokeh', name: 'Bokeh', group: 'Lens',
    apply: (L, k, t, s) => particles(L, t, Math.round(8 + 20 * k), (x, px, py, i, sc) => {
      const r = (24 + rand(i) * 60) * sc; const hue = Math.floor(rand(i + 2) * 360);
      const g = x.createRadialGradient(px, py, r * 0.2, px, py, r);
      g.addColorStop(0, `hsla(${hue},70%,70%,0.35)`); g.addColorStop(1, `hsla(${hue},70%,70%,0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }, 20, s),
  },
];
export const effectById = (id: string) => EFFECTS.find((f) => f.id === id);

/** Tonal range adjustments and a four-neighbor unsharp kernel. */
export function adjustDetail(L: HTMLCanvasElement, e: Effects) {
  const hi = (e.highlights ?? 0) / 100, sh = (e.shadows ?? 0) / 100, sharp = (e.sharpen ?? 0) / 100;
  if (!hi && !sh && !sharp && !e.whites && !e.blacks && !e.vibrance && !e.clarity && !e.grain && !e.fade) return;
  const x = ctx2d(L), img = x.getImageData(0, 0, L.width, L.height);
  const src = new Uint8ClampedArray(img.data), d = img.data, w = L.width, h = L.height;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = (y * w + xx) * 4;
    const lum = ((src[i] ?? 0) * 0.213 + (src[i + 1] ?? 0) * 0.715 + (src[i + 2] ?? 0) * 0.072) / 255;
    const delta = 80 * (hi * lum * lum + sh * (1 - lum) ** 2) + (e.whites ?? 0) * lum ** 4 + (e.blacks ?? 0) * (1-lum) ** 4;
    const saturation = (Math.max(src[i]!,src[i+1]!,src[i+2]!) - Math.min(src[i]!,src[i+1]!,src[i+2]!))/255;
    const noise = (rand(y*w+xx) - .5) * (e.grain ?? 0) * .8;
    const neighbors = [i - 4, i + 4, i - w * 4, i + w * 4];
    for (let ch = 0; ch < 3; ch++) {
      const v = src[i + ch] ?? 0;
      const edge = xx > 0 && xx < w - 1 && y > 0 && y < h - 1;
      const avg = edge ? neighbors.reduce((n, j) => n + (src[j + ch] ?? v), 0) / 4 : v;
      const adjusted = v + delta + (sharp * 2 + (e.clarity ?? 0)/25) * (v - avg) + (v-lum*255)*(e.vibrance ?? 0)/100*(1-saturation) + noise;
      d[i + ch] = adjusted + (128-adjusted)*(e.fade ?? 0)/200;
    }
  }
  x.putImageData(img, 0, 0);
}

// Original compound looks, not copies of CapCut's licensed catalog.
const COMPOUNDS: [string, string, FxDef['group'], string[]][] = [
  ['love-bubble', 'Love Bubble', 'Party', ['hearts', 'glow']],
  ['fireworks', 'Fireworks', 'Party', ['sparkle', 'confetti', 'flash']],
  ['noise-2', 'Noise 2', 'Retro', ['grain', 'rgb-split']],
  ['bw-array', 'BW Array', 'Split', ['ink', 'split-4']],
  ['shake-flash', 'Shake & Flash', 'Party', ['shake', 'flash']],
  ['soft-wave', 'Soft Wave', 'Distort', ['wave', 'glow']],
  ['phantom', 'Phantom', 'Retro', ['duotone', 'zoom-blur']],
  ['neon-party', 'Neon Party', 'Party', ['rainbow', 'rgb-split', 'sparkle']],
  ['winter-glow', 'Winter Glow', 'Nature', ['snow', 'glow']],
  ['storm', 'Storm', 'Nature', ['rain', 'flash']],
  ['retro-tv', 'Retro TV', 'Retro', ['vhs', 'letterbox']],
  ['prism', 'Prism', 'Split', ['kaleido', 'rainbow']],
];
for (const [id, name, group, ids] of COMPOUNDS) {
  const defs = ids.flatMap((key) => { const def = effectById(key); return def ? [def] : []; });
  EFFECTS.push({ id, name, group,
    apply: (L, k, t, s) => { for (const def of defs) def.apply?.(L, k, t, s); },
    post: (k, t, s) => defs.reduce((out, def) => {
      const p = def.post?.(k, t, s);
      return { dx: out.dx + (p?.dx ?? 0), dy: out.dy + (p?.dy ?? 0), scale: out.scale * (p?.scale ?? 1), rotation: out.rotation + (p?.rotation ?? 0) };
    }, { dx: 0, dy: 0, scale: 1, rotation: 0 }),
  });
}

/** Apply color + effects to a clip's layer; returns post transform for compositing. */
export function processLayer(
  L: HTMLCanvasElement,
  effects: Effects,
  filter: FilterRef | undefined,
  fx: FxRef[] | undefined,
  t: number,
  s: number,
): PostTransform {
  const post: PostTransform = { dx: 0, dy: 0, scale: 1, rotation: 0 };
  const { m, vignette: vg } = clipColorMatrix(effects, filter);
  try {
    if (effects.blur > 0) blurInPlace(L, effects.blur * s);
    if (!isIdent(m)) applyMatrix(L, m);
    const grade = filter && filterById(filter.id)?.grade;
    if (grade && filter) {
      const ctx = ctx2d(L), image = ctx.getImageData(0, 0, L.width, L.height);
      gradePixels(image.data, grade, Math.max(0, Math.min(1, filter.intensity / 100)));
      ctx.putImageData(image, 0, 0);
    }
    adjustDetail(L, effects);
    if (vg > 0) vignette(L, vg);
    for (const f of fx ?? []) {
      const def = effectById(f.id);
      if (!def) continue;
      const k = Math.max(0, Math.min(1, f.intensity / 100));
      if (k <= 0) continue;
      const time = t * (f.speed ?? 1);
      const blend = Math.max(0, Math.min(1, (f.blend ?? 100) / 100));
      const before = blend < 1 ? copyOf(L, 'effect-blend') : null;
      def.apply?.(L, k, time, s);
      if (before) {
        const processed = copyOf(L, 'effect-blend-result');
        clear(L); const cx = ctx2d(L); cx.drawImage(before, 0, 0);
        cx.globalAlpha = blend; cx.drawImage(processed, 0, 0); cx.globalAlpha = 1;
      }
      const p = def.post?.(k * blend, time, s);
      if (p) {
        post.dx += p.dx ?? 0;
        post.dy += p.dy ?? 0;
        post.scale *= p.scale ?? 1;
        post.rotation += p.rotation ?? 0;
      }
    }
  } catch (e) {
    // a tainted canvas (media without CORS) can't be read back; keep rendering unprocessed
    console.warn("effect skipped", e);
  }
  return post;
}
