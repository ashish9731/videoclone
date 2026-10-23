import { describe, it, expect } from 'vitest';
import { clipFromAsset, defaultEffects, newTrack, type MediaAsset } from '@/lib/editor/types';
import { fadeEnvelope, visualFadeAt, volumeFromLine } from '@/lib/editor/clip-controls';
import { clipGainAt } from '@/lib/editor/audio-fx';
import { EditorStore } from '@/lib/editor/store';
import { addClipToTimeline } from '@/lib/editor/placement';

const asset: MediaAsset = { id: 'a', name: 'test', storage_path: 'test', project_id: null, kind: 'video', mime: 'video/webm', size_bytes: 1, duration: 4, width: 320, height: 180 };
describe('clean media insertion', () => {
  for (const kind of ['video', 'image'] as const) it(`adds ${kind} without effects, transitions or fades even beside an edited clip`, () => {
    const previous = { ...clipFromAsset(asset, 0), filter: { id: 'noir', intensity: 100 }, transitionIn: { type: 'fade', duration: 1 } };
    const store = new EditorStore({ tracks: [{ ...newTrack('video', 1), clips: [previous] }] });
    const c = clipFromAsset({ ...asset, kind }, 4);
    addClipToTimeline(store, c);
    const inserted = store.findClip(c.id)?.clip;
    expect(inserted?.effects).toEqual(defaultEffects());
    expect(inserted?.filter).toBeUndefined(); expect(inserted?.fx).toBeUndefined();
    expect(inserted?.transitionIn).toBeUndefined(); expect(inserted?.transitionOut).toBeUndefined();
    expect(inserted?.visualFadeIn ?? 0).toBe(0); expect(inserted?.fadeIn).toBe(0);
  });
});
describe('adjustable fades and clip volume', () => {
  it('visual fades reveal the background at the edges and half opacity halfway through each fade', () => {
    const c = { ...clipFromAsset(asset, 2), visualFadeIn: 1, visualFadeOut: 1 };
    expect(visualFadeAt(c, 2)).toBe(0); expect(visualFadeAt(c, 2.5)).toBe(.5);
    expect(visualFadeAt(c, 4)).toBe(1); expect(visualFadeAt(c, 5.5)).toBe(.5); expect(visualFadeAt(c, 6)).toBe(0);
  });
  it('audio fades apply the same envelope independently from visual fades', () => {
    const c = { ...clipFromAsset(asset, 0), fadeIn: 1, fadeOut: 1, volume: 2 };
    expect(clipGainAt(c, .5, null)).toBe(1); expect(clipGainAt(c, 3.5, null)).toBe(1);
    expect(visualFadeAt(c, 0)).toBe(1); expect(fadeEnvelope(-1, 4, 1, 1)).toBe(0);
  });
  it('volume line maps low to zero, center to 100%, and high to 200%', () => {
    expect(volumeFromLine(1)).toBe(0); expect(volumeFromLine(.5)).toBe(1); expect(volumeFromLine(0)).toBe(2);
  });
  it('muting one audio clip leaves its volume remembered and other clips unchanged', () => {
    const c = { ...clipFromAsset(asset, 0), kind: 'audio' as const, volume: .75 };
    const other = { ...c, id: 'other', volume: 1.5 };
    const store = new EditorStore({ tracks: [{ ...newTrack('audio', 1), clips: [c, other] }] });
    store.updateClip(c.id, x => ({ ...x, muted: true }));
    const muted = store.findClip(c.id)?.clip;
    expect(muted?.volume).toBe(.75);
    expect(muted && clipGainAt(muted, 2, null)).toBe(0);
    expect(store.findClip('other')?.clip.volume).toBe(1.5);
  });
});