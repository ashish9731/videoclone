import type { Clip } from './types';
/** Normalized RGB distance; tolerance and softness use 0..1. */
export function colorDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) / Math.sqrt(3 * 255 ** 2);
}
export function keyAlpha(distance: number, tolerance: number, softness: number): number {
  const v = Math.max(0, Math.min(1, (distance - tolerance) / Math.max(0.00001, softness)));
  return v * v * (3 - 2 * v);
}
export function applyKey(layer: HTMLCanvasElement, key: Clip['chroma']) {
  if (!key?.enabled) return;
  const ctx = layer.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, layer.width, layer.height);
  const rgb = [1, 3, 5].map(i => parseInt(key.color.slice(i, i + 2), 16));
  const dominant = rgb.indexOf(Math.max(...rgb));
  for (let i = 0; i < image.data.length; i += 4) {
    const d = image.data;
    const alpha = keyAlpha(colorDistance([d[i]!, d[i + 1]!, d[i + 2]!], rgb), key.tolerance, key.softness);
    d[i + 3] = d[i + 3]! * alpha;
    const others = [0, 1, 2].filter(c => c !== dominant);
    const neutral = (d[i + others[0]!]! + d[i + others[1]!]!) / 2;
    d[i + dominant] = d[i + dominant]! - Math.max(0, d[i + dominant]! - neutral) * key.spill * (1 - alpha);
  }
  ctx.putImageData(image, 0, 0);
}
