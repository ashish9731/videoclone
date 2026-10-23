import type { Clip } from './types';
/** Normalized RGB distance; tolerance and softness use 0..1. */
export function colorDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) / Math.sqrt(3 * 255 ** 2);
}
export function keyAlpha(distance: number, tolerance: number, softness: number): number {
  const v = Math.max(0, Math.min(1, (distance - tolerance) / Math.max(0.00001, softness)));
  return v * v * (3 - 2 * v);
}
const OTHERS: readonly [number, number][] = [[1, 2], [0, 2], [0, 1]];
const DISTANCE_SCALE = 1 / Math.hypot(255, 255, 255);
export function applyKey(layer: HTMLCanvasElement, key: Clip['chroma']) {
  if (!key?.enabled) return;
  const ctx = layer.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, layer.width, layer.height);
  const d = image.data;
  // hoisted: the per-pixel version allocated three arrays per frame per pixel and stalled keying
  const kr = parseInt(key.color.slice(1, 3), 16) || 0;
  const kg = parseInt(key.color.slice(3, 5), 16) || 0;
  const kb = parseInt(key.color.slice(5, 7), 16) || 0;
  const dominant = kr >= kg && kr >= kb ? 0 : kg >= kb ? 1 : 2;
  const [o0, o1] = OTHERS[dominant]!;
  const tolerance = key.tolerance;
  const softness = Math.max(0.00001, key.softness);
  const spill = key.spill;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const dr = d[i]! - kr, dg = d[i + 1]! - kg, db = d[i + 2]! - kb;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db) * DISTANCE_SCALE;
    const v = Math.max(0, Math.min(1, (distance - tolerance) / softness));
    const alpha = v * v * (3 - 2 * v);
    d[i + 3] = d[i + 3]! * alpha;
    if (spill > 0 && alpha < 1) {
      const own = d[i + dominant]!;
      const neutral = (d[i + o0]! + d[i + o1]!) / 2;
      d[i + dominant] = own - Math.max(0, own - neutral) * spill * (1 - alpha);
    }
  }
  ctx.putImageData(image, 0, 0);
}
