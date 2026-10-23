/** Deterministic photographic looks; nonlinear grading is shared by preview/export. */
export interface Grade {
  gamma: number;
  contrast: number;
  saturation: number;
  fade: number;
  grain: number;
  shadows: [number, number, number];
  highlights: [number, number, number];
}

/**
 * A grade's curve is `pow(x, gamma)` per channel per pixel. Measured on a 1280x720 layer that is
 * ~200ms a frame, which is what made adding a filter stutter video and audio. The curve only
 * depends on the grade, so it is baked once into a LUT (fade folded in) and read as a single load
 * indexed by the mixed channel value. 4096 samples over the reachable input range are 8 samples
 * per 8-bit step, which keeps the worst truncation error under one output step even for the
 * steepest gamma near black.
 */
const CURVE_N = 4096;
/** normalized input the LUT spans: desaturating/tinted pixels can exceed 1 before clamping */
const CURVE_MAX = 2;
const curveCache = new Map<string, Float64Array>();

function curveLut(grade: Grade): Float64Array {
  const key = `${grade.gamma}|${grade.contrast}|${grade.fade}`;
  const hit = curveCache.get(key);
  if (hit) return hit;
  const lut = new Float64Array(CURVE_N);
  const fadeK = 1 - grade.fade / 255;
  for (let k = 0; k < CURVE_N; k++) {
    const x = (k / CURVE_N) * CURVE_MAX;
    const curved = (Math.pow(x, grade.gamma) - 0.5) * grade.contrast * 255 + 127.5;
    lut[k] = curved * fadeK + grade.fade;
  }
  if (curveCache.size > 64) curveCache.clear(); // grades are a fixed catalog; this never really fills
  curveCache.set(key, lut);
  return lut;
}

/**
 * Integer hash speckle in 0..1 - the same job as the old per-pixel Math.sin, without the cost.
 * Even the hash was worth ~50ms a frame when it ran per pixel, so grain reads a table instead: it
 * is still a fixed function of the pixel index, which keeps a preview frame and its export frame
 * using the same pattern (and the detail pass shares the table for the same reason).
 */
export function speckle(n: number): number {
  let h = Math.imul(n, 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1597334677) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export const NOISE_N = 4096;
export const NOISE_MASK = NOISE_N - 1;
let noiseTable: Float32Array | null = null;

/** Deterministic grain values, indexed by pixel (shared by the grade and the detail pass). */
export function noiseValues(): Float32Array {
  if (!noiseTable) {
    noiseTable = new Float32Array(NOISE_N);
    for (let k = 0; k < NOISE_N; k++) noiseTable[k] = speckle(k);
  }
  return noiseTable;
}

const groups = [
  "Film",
  "Portrait",
  "Food",
  "Landscape",
  "Vintage",
  "Cinematic",
  "B&W",
  "Mono-tint",
  "Night",
  "Retro",
];
const names = [
  "Amber",
  "Azure",
  "Copper",
  "Pearl",
  "Velvet",
  "Jade",
  "Rose",
  "Slate",
  "Honey",
  "Indigo",
  "Coral",
  "Olive",
  "Plum",
  "Ice",
  "Sand",
  "Ruby",
  "Mist",
  "Gold",
  "Ocean",
  "Ember",
];
export const GENERATED_FILTERS = groups.flatMap((group, g) =>
  names.map((name, i) => {
    const a = i * 2.39996 + g * 0.7;
    const tint = (phase: number, strength: number): [number, number, number] =>
      [0, 2.094, 4.189].map((p) => Math.cos(a + p + phase) * strength) as [number, number, number];
    const grade: Grade = {
      gamma: 0.65 + (i % 5) * 0.19 + (g === 8 ? 0.45 : 0),
      contrast: 0.78 + Math.floor(i / 5) * 0.24,
      saturation: g === 6 || g === 7 ? 0 : g === 2 ? 1.35 : 0.65 + (i % 4) * 0.3,
      fade: g === 4 || g === 9 ? 12 + (i % 3) * 9 : (i % 3) * 3,
      grain: g === 0 || g === 4 || g === 9 ? 5 + (i % 4) : 0,
      shadows: tint(0, g === 6 ? 0 : 24 + (i % 4) * 8),
      highlights: tint(1.4, g === 6 ? 0 : 18 + (i % 3) * 10),
    };
    return {
      id: `grade-${g}-${i}`,
      name: `${name} ${group}`,
      group,
      grade,
      m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      swatch: `linear-gradient(135deg,hsl(${a * 57.3} 55% 30%),hsl(${a * 57.3 + 80} 70% 75%))`,
    };
  }),
);
/**
 * Apply a grade over an RGBA buffer in place. Everything that only depends on the grade is hoisted
 * out of the loop - the curve LUT, the grain table, the two mix coefficients and the three channel
 * tint scalars - because the loop runs almost a million times per frame and per-pixel property
 * lookups, `Math.pow` and even an integer hash were all measurable.
 */
export function gradePixels(d: Uint8ClampedArray, grade: Grade, intensity: number) {
  const lut = curveLut(grade);
  const grain = grade.grain;
  const noise = grain !== 0 ? noiseValues() : null;
  const [sh0, sh1, sh2] = grade.shadows;
  const [hl0, hl1, hl2] = grade.highlights;
  const scale = CURVE_N / (CURVE_MAX * 255); // LUT steps per unit of 8-bit channel value
  const satK = scale * grade.saturation;
  const lumCoeff = scale * 255 * (1 - grade.saturation);
  const top = CURVE_N - 1;
  const n = d.length;
  for (let i = 0; i < n; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i]!,
      g = d[i + 1]!,
      b = d[i + 2]!;
    const lum = (r * 0.213 + g * 0.715 + b * 0.072) / 255;
    const lift = (1 - lum) * (1 - lum);
    const gain = lum * lum;
    const mix = lumCoeff * lum; // the luma half of the saturation mix, shared by all channels
    const speck = noise !== null ? noise[(i >> 2) & NOISE_MASK]! * grain : 0;
    let m0 = mix + satK * r;
    if (m0 < 0) m0 = 0;
    else if (m0 > top) m0 = top;
    let m1 = mix + satK * g;
    if (m1 < 0) m1 = 0;
    else if (m1 > top) m1 = top;
    let m2 = mix + satK * b;
    if (m2 < 0) m2 = 0;
    else if (m2 > top) m2 = top;
    const v0 = lut[m0 | 0]! + sh0 * lift + hl0 * gain + speck;
    const v1 = lut[m1 | 0]! + sh1 * lift + hl1 * gain + speck;
    const v2 = lut[m2 | 0]! + sh2 * lift + hl2 * gain + speck;
    d[i] = r + (v0 - r) * intensity;
    d[i + 1] = g + (v1 - g) * intensity;
    d[i + 2] = b + (v2 - b) * intensity;
  }
}
