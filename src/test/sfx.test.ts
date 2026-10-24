import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { SOUNDS, renderSound, encodeWav } from '../lib/editor/sfx';
const require = createRequire(import.meta.url);
beforeAll(() => {
  const engine = require('web-audio-engine') as { OfflineAudioContext: typeof OfflineAudioContext };
  globalThis.OfflineAudioContext = engine.OfflineAudioContext;
});
// synthesized cues are rendered through the engine; real recordings ship as files and are checked on disk
const procedural = SOUNDS.filter(s => !s.url);
const real = SOUNDS.filter(s => s.url);
describe('original audio library', () => {
  it('has 42 unique catalog IDs (40 synthesized, 2 real recordings)', () => {
    expect(SOUNDS).toHaveLength(42);
    expect(new Set(SOUNDS.map(s => s.id)).size).toBe(42);
    expect(procedural).toHaveLength(40);
    expect(real).toHaveLength(2);
  });
  for (const sound of procedural) it(`renders non-silent ${sound.name} with correct duration and WAV header`, async () => {
    const buffer = await renderSound(sound);
    expect(buffer.duration).toBeCloseTo(sound.duration, 3);
    const data = buffer.getChannelData(0);
    let energy = 0, finite = true;
    for (const value of data) { finite &&= Number.isFinite(value); energy += value * value; }
    expect(finite).toBe(true);
    expect(Math.sqrt(energy / data.length)).toBeGreaterThan(0.005);
    const blob = encodeWav(buffer);
    expect(blob.type).toBe('audio/wav'); expect(blob.size).toBe(44 + data.length * 2);
  });
  it('ships every real recording as a playable file that exists on disk', () => {
    for (const sound of real) {
      expect(sound.url, sound.id).toMatch(/^\/audio\/.+\.mp3$/);
      expect(sound.duration, sound.id).toBeGreaterThan(0);
      const path = `public${sound.url}`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size, path).toBeGreaterThan(1000);
    }
  });
});
