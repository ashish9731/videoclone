/** Royalty-free audio library: procedurally synthesized beds/loops/SFX plus a few real bundled recordings (entries that carry a `url`). */
export interface Sound { id: string; name: string; category: 'Music beds' | 'Drum loops' | 'SFX' | 'Devotional'; duration: number; bpm?: number; variant: number; url?: string }
const beds = ['Lo-fi dusk', 'Lo-fi rain', 'Upbeat sunrise', 'Upbeat sparkle', 'Ambient drift', 'Ambient stars', 'Cinematic tension', 'Cinematic resolve'];
const effects = ['Whoosh', 'Swoosh', 'Pop', 'Riser', 'Impact', 'Click', 'Ding', 'Boom', 'Glitch', 'Typing', 'Applause noise', 'Downlifter', 'Laser', 'Bubble', 'Chime', 'Notification', 'Heartbeat', 'Wind', 'Static burst', 'Sparkle', 'Knock', 'Shutter', 'Zap', 'Water drop'];
// Real recordings served from public/audio and played/uploaded as their own file (never synthesized).
const real: Sound[] = [
  { id: 'dev-flute', name: 'Krishna Flute', category: 'Devotional', duration: 137.72, variant: 0, url: '/audio/devotional/krishna-flute.mp3' },
  { id: 'dev-bell', name: 'Meditation Bell', category: 'Devotional', duration: 144.51, variant: 0, url: '/audio/devotional/meditation-bell.mp3' },
];
export const SOUNDS: Sound[] = [
  ...beds.map((name, i): Sound => ({ id: `bed-${i}`, name, category: 'Music beds', duration: 12, variant: i })),
  ...[80, 100, 120, 140, 90, 110, 130, 160].map((bpm, i): Sound => ({ id: `drums-${bpm}`, name: `${i < 4 ? 'Pocket' : 'Breakbeat'} ${bpm} BPM`, category: 'Drum loops', bpm, duration: 16 * 60 / bpm, variant: i })),
  ...effects.map((name, i): Sound => ({ id: `sfx-${i}`, name, category: 'SFX', duration: [0.9, 0.65, 0.22, 3, 1.2, 0.12, 1.5, 2, 0.8, 2, 3, 2.5, 0.6, 0.4, 2, 0.8, 2, 3, 0.5, 2, 0.35, 0.3, 0.7, 0.5][i]!, variant: i })),
  ...real,
];
const TAU = Math.PI * 2;
export async function renderSound(sound: Sound, sampleRate = 24000): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.round(sound.duration * sampleRate), sampleRate);
  const buffer = ctx.createBuffer(1, ctx.length, sampleRate), data = buffer.getChannelData(0);
  let seed = 1937 + sound.variant * 7919, low = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; };
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate, u = t / sound.duration, v = sound.variant;
    const noise = random(); low = low * 0.94 + noise * 0.06;
    let x = 0;
    if (sound.category === 'Music beds') {
      const beat = t * (v < 2 ? 78 : v < 4 ? 116 : 60) / 60;
      const root = [130.81, 146.83, 164.81, 196][Math.floor(t / 3) % 4]!;
      const pulse = beat % 1;
      const chord = [1, 1.25992, 1.4983].reduce((s, ratio) => s + Math.sin(TAU * root * ratio * t + 0.3 * Math.sin(t * (v + 1))), 0) / 3;
      const melody = Math.sin(TAU * root * [2, 2.5, 3, 4][Math.floor(beat * 2) % 4]! * t) * Math.exp(-6 * ((beat * 2) % 1));
      x = chord * (v >= 4 ? 0.45 : 0.22) + melody * (v < 4 ? 0.2 : 0.08) + Math.sin(TAU * root / 2 * t) * 0.16;
      if (v < 4) x += Math.sin(TAU * (45 * t - 1.5 * Math.exp(-pulse * 20))) * Math.exp(-pulse * 18) * 0.35 + noise * Math.exp(-((beat * 2) % 1) * 65) * 0.08;
      if (v >= 6) x *= 0.2 + u * 0.8;
    } else if (sound.category === 'Drum loops') {
      const beat = t * sound.bpm! / 60, p = beat % 1, snare = (beat + 1) % 2, hat = (beat * (v < 4 ? 2 : 4)) % 1;
      x = 0.65 * Math.sin(TAU * (48 * p - 1.6 * Math.exp(-p * 30))) * Math.exp(-p * 15)
        + noise * Math.exp(-snare * 22) * 0.35 + (noise - low) * Math.exp(-hat * 55) * (0.08 + v * 0.012);
    } else {
      const decay = Math.exp(-u * 7), tone = (f: number) => Math.sin(TAU * f * t);
      switch (v) {
        case 0: case 1: x = (noise - low) * Math.sin(Math.PI * u) ** 2 * (v ? 0.5 : 0.8) + low * Math.sin(Math.PI * u) * (v ? 2 : 0.5); break;
        case 2: x = Math.sin(100 * (1 - Math.exp(-t * 40))) * decay; break;
        case 3: x = (noise * 0.4 + Math.sin(TAU * (80 * t + 180 * t * t)) * 0.3) * u * u; break;
        case 4: x = (tone(65) * 0.6 + noise * 0.5) * decay; break;
        case 5: x = noise * Math.exp(-t * 180); break;
        case 6: x = (tone(880) + tone(1321) * 0.4) * decay * 0.6; break;
        case 7: x = Math.sin(TAU * (32 * t - 2 * Math.exp(-t * 9))) * decay * 0.8 + low * decay; break;
        case 8: x = (tone(200 + Math.floor(t * 25) % 4 * 210) > 0 ? 0.5 : -0.5) * (Math.sin(t * 90) > 0 ? 1 : 0.1) * (1 - u); break;
        case 9: x = noise * Math.exp(-((t * 9) % 1) * 25) * 0.6; break;
        case 10: x = (noise - low) * (0.25 + 0.15 * Math.sin(t * 32) ** 2); break;
        case 11: x = noise * (1 - u) * 0.5 + Math.sin(TAU * (900 * t - 150 * t * t)) * decay * 0.3; break;
        case 12: x = Math.sin(180 * Math.log(1 + t * 30)) * decay * 0.7; break;
        case 13: x = Math.sin(TAU * (300 * t + 600 * t * t)) * decay; break;
        case 14: x = (tone(523) + tone(659) + tone(784)) * decay * 0.25; break;
        case 15: x = tone(t < 0.18 ? 660 : 990) * decay * 0.6; break;
        case 16: x = tone(65) * Math.exp(-((t * 1.8) % 1) * 18) * 0.7; break;
        case 17: x = low * (0.6 + 0.4 * Math.sin(t * 3)) * 2; break;
        case 18: x = noise * decay * 0.7; break;
        case 19: x = tone(1500 + Math.floor(t * 8) * 137) * Math.exp(-((t * 8) % 1) * 8) * (1 - u) * 0.4; break;
        case 20: x = (tone(240) + low) * decay * 0.7; break;
        case 21: x = noise * (Math.exp(-t * 90) + 0.5 * Math.exp(-Math.abs(t - 0.09) * 130)); break;
        case 22: x = Math.sin(TAU * (600 * t + 110 * Math.sin(t * 20))) * decay * 0.6; break;
        default: x = Math.sin(TAU * (700 * t - 350 * t * t)) * decay * 0.7;
      }
    }
    const fade = Math.min(1, t / 0.005, (sound.duration - t) / 0.025);
    data[i] = Math.tanh(x) * fade;
  }
  const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination); source.start();
  return ctx.startRendering();
}
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.max(1, buffer.numberOfChannels);
  const frames = buffer.length;
  const dataSize = frames * channels * 2;
  const bytes = 44 + dataSize, view = new DataView(new ArrayBuffer(bytes));
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, dataSize, true);
  const data: Float32Array[] = []; for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, data[c]![i] ?? 0)) * 32767), true); offset += 2; }
  return new Blob([view], { type: 'audio/wav' });
}
