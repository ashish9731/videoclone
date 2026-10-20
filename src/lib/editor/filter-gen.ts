/** Deterministic photographic looks; nonlinear grading is shared by preview/export. */
export interface Grade {
  gamma: number; contrast: number; saturation: number; fade: number; grain: number;
  shadows: [number, number, number]; highlights: [number, number, number];
}
const groups = ['Film', 'Portrait', 'Food', 'Landscape', 'Vintage', 'Cinematic', 'B&W', 'Mono-tint', 'Night', 'Retro'];
const names = ['Amber', 'Azure', 'Copper', 'Pearl', 'Velvet', 'Jade', 'Rose', 'Slate', 'Honey', 'Indigo', 'Coral', 'Olive', 'Plum', 'Ice', 'Sand', 'Ruby', 'Mist', 'Gold', 'Ocean', 'Ember'];
export const GENERATED_FILTERS = groups.flatMap((group, g) => names.map((name, i) => {
  const a = i * 2.39996 + g * 0.7;
  const tint = (phase: number, strength: number): [number, number, number] => [0, 2.094, 4.189].map(p => Math.cos(a + p + phase) * strength) as [number, number, number];
  const grade: Grade = {
    gamma: 0.65 + (i % 5) * 0.19 + (g === 8 ? 0.45 : 0),
    contrast: 0.78 + Math.floor(i / 5) * 0.24,
    saturation: g === 6 || g === 7 ? 0 : g === 2 ? 1.35 : 0.65 + (i % 4) * 0.3,
    fade: g === 4 || g === 9 ? 12 + (i % 3) * 9 : (i % 3) * 3,
    grain: g === 0 || g === 4 || g === 9 ? 5 + i % 4 : 0,
    shadows: tint(0, g === 6 ? 0 : 24 + (i % 4) * 8),
    highlights: tint(1.4, g === 6 ? 0 : 18 + (i % 3) * 10),
  };
  return { id: `grade-${g}-${i}`, name: `${name} ${group}`, group, grade,
    m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    swatch: `linear-gradient(135deg,hsl(${a * 57.3} 55% 30%),hsl(${a * 57.3 + 80} 70% 75%))` };
}));
export function gradePixels(d: Uint8ClampedArray, grade: Grade, intensity: number) {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    const lum = (r * 0.213 + g * 0.715 + b * 0.072) / 255;
    const noise = (Math.sin(i * 12.9898) * 43758.5453 % 1) * grade.grain;
    for (let c = 0; c < 3; c++) {
      const original = d[i + c]!;
      const sat = lum * 255 + (original - lum * 255) * grade.saturation;
      const curved = (Math.pow(Math.max(0, sat / 255), grade.gamma) - 0.5) * grade.contrast * 255 + 127.5;
      const value = curved * (1 - grade.fade / 255) + grade.fade + grade.shadows[c]! * (1 - lum) ** 2 + grade.highlights[c]! * lum ** 2 + noise;
      d[i + c] = original + (value - original) * intensity;
    }
  }
}
