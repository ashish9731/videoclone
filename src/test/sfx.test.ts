import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { SOUNDS, renderSound, encodeWav } from '../lib/editor/sfx';
const require = createRequire(import.meta.url);
beforeAll(() => {
  const engine = require('web-audio-engine') as { OfflineAudioContext: typeof OfflineAudioContext };
  globalThis.OfflineAudioContext = engine.OfflineAudioContext;
});
describe('original audio library', () => {
  it('has 40 unique catalog IDs', () => { expect(SOUNDS).toHaveLength(40); expect(new Set(SOUNDS.map(s => s.id)).size).toBe(40); });
  for (const sound of SOUNDS) it(`renders non-silent ${sound.name} with correct duration and WAV header`, async () => {
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
});
