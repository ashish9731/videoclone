import { describe, expect, it } from "vitest";
import {
  GENERATED_FILTERS,
  gradePixels,
  noiseValues,
  NOISE_N,
  speckle,
  type Grade,
} from "@/lib/editor/filter-gen";

/**
 * The curve is baked into a LUT for speed, so the check is that the fast path still says the same
 * thing as the slow one: this is the exact per-pixel math the pipeline used before the LUT existed.
 */
function referenceGrade(d: Uint8ClampedArray, grade: Grade, intensity: number) {
  const out = new Uint8ClampedArray(d.length);
  out.set(d);
  const fadeK = 1 - grade.fade / 255;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i]!,
      g = d[i + 1]!,
      b = d[i + 2]!;
    const lum = (r * 0.213 + g * 0.715 + b * 0.072) / 255;
    const lift = (1 - lum) * (1 - lum);
    const gain = lum * lum;
    const chan = [r, g, b];
    for (let c = 0; c < 3; c++) {
      const mixed = Math.min(
        2,
        Math.max(0, grade.saturation * (chan[c]! / 255) + (1 - grade.saturation) * lum),
      );
      const curved = (Math.pow(mixed, grade.gamma) - 0.5) * grade.contrast * 255 + 127.5;
      const faded = curved * fadeK + grade.fade;
      const value = faded + grade.shadows[c]! * lift + grade.highlights[c]! * gain;
      out[i + c] = chan[c]! + (value - chan[c]!) * intensity;
    }
  }
  return out;
}

const frame = (n: number) => {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    // sweep every 8-bit value so the comparison covers the whole curve, incl. the steep part
    const v = i % 256;
    d[i * 4] = v;
    d[i * 4 + 1] = (v * 3) % 256;
    d[i * 4 + 2] = 255 - v;
    d[i * 4 + 3] = 255;
  }
  return d;
};

describe("gradePixels LUT path", () => {
  const noGrain = GENERATED_FILTERS.filter((f) => f.grade.grain === 0);

  it("matches the exact pow reference across the catalog", () => {
    expect(noGrain.length).toBeGreaterThan(20);
    let worst = 0;
    for (const filter of noGrain) {
      const src = frame(256 * 4);
      const fast = new Uint8ClampedArray(src);
      gradePixels(fast, filter.grade, 1);
      const slow = referenceGrade(src, filter.grade, 1);
      for (let i = 0; i < src.length; i += 4) {
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(fast[i + c]! - slow[i + c]!));
      }
    }
    expect(worst).toBeLessThanOrEqual(2);
  });

  it("leaves untouched channels and fully transparent pixels alone", () => {
    const d = new Uint8ClampedArray([10, 20, 30, 0, 10, 20, 30, 255]);
    const before = new Uint8ClampedArray(d);
    gradePixels(d, GENERATED_FILTERS[0]!.grade, 1);
    expect([d[0], d[1], d[2], d[3]]).toEqual([before[0]!, before[1]!, before[2]!, 0]);
  });

  it("blends by intensity", () => {
    const grade = GENERATED_FILTERS[0]!.grade;
    const half = frame(64);
    gradePixels(half, grade, 0);
    expect(Array.from(half.slice(0, 4))).toEqual([0, 0, 255, 255]);
  });
});

describe("grain noise table", () => {
  it("is a deterministic function of the index, in range", () => {
    const noise = noiseValues();
    expect(noise.length).toBe(NOISE_N);
    // the table is a Float32Array, so the hash value is stored at single precision
    expect(noise[7]!).toBeCloseTo(speckle(7), 6);
    expect(noiseValues()[7]!).toBe(noise[7]!);
    for (let k = 0; k < NOISE_N; k += 97) {
      expect(noise[k]!).toBeGreaterThanOrEqual(0);
      expect(noise[k]!).toBeLessThan(1);
    }
  });

  it("is stable across calls, so preview and export share one pattern", () => {
    expect(Array.from(noiseValues().slice(0, 32))).toEqual(Array.from(noiseValues().slice(0, 32)));
  });
});
