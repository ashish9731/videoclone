import { describe, expect, it } from 'vitest';
import { insertFreeze, trimAtPlayhead } from '@/lib/editor/edit-actions';
import { clipFromAsset, sourceTime, clipDuration, defaultEffects } from '@/lib/editor/types';
import { adjustMatrix, isIdent } from '@/lib/editor/fx';
import { EditorStore } from '@/lib/editor/store';
import { addClipToTimeline } from '@/components/editor/Timeline';
import { shapeClip } from '@/lib/editor/presets';
import { presetTarget, visiblePresetTime } from '@/lib/editor/placement';
const video = () => clipFromAsset({ id: 'v', name: 'v', kind: 'video', storage_path: 'x', mime: 'video/webm', size_bytes: 1, duration: 10, width: 640, height: 360, project_id: null }, 0);
describe('timeline toolbar edits', () => {
  it('presets target video at the playhead without requiring selection', () => {
    const c = video();
    const store = new EditorStore({ tracks: [{ id: 'v', name: 'Video', kind: 'video', locked: false, muted: false, hidden: false, clips: [c] }] });
    store.set({ time: 3 });
    expect(presetTarget(store)?.clip.id).toBe(c.id);
    expect(visiblePresetTime(store)).toBe(3);
  });
  it('presets seek into selected media when playhead is at its exclusive end', () => {
    const c = video();
    const store = new EditorStore({ tracks: [{ id: 'v', name: 'Video', kind: 'video', locked: false, muted: false, hidden: false, clips: [c] }] });
    store.set({ time: 10, selectedClipId: c.id });
    expect(visiblePresetTime(store)).toBe(0.25);
  });
  it('new illustrated sticker is placed above video and immediately active', () => {
    const store = new EditorStore({ tracks: [{ id: 'v', name: 'Video', kind: 'video', locked: false, muted: false, hidden: false, clips: [video()] }] });
    store.set({ time: 3, playing: true });
    const sticker = shapeClip('sticker:cat', 3);
    addClipToTimeline(store, sticker);
    expect(store.get().timeline.tracks[0]?.clips[0]?.id).toBe(sticker.id);
    expect(store.get().time).toBe(3.25);
    expect(store.get().playing).toBe(false);
    expect(store.get().selectedClipId).toBe(sticker.id);
  });
  it('trim left removes only material before the playhead', () => {
    const c = trimAtPlayhead(video(), 4, 'left');
    expect(c?.start).toBe(4); expect(c?.in).toBe(4); expect(c?.out).toBe(10);
  });
  it('trim right removes only material after the playhead', () => {
    const c = trimAtPlayhead(video(), 4, 'right');
    expect(c?.start).toBe(0); expect(c?.in).toBe(0); expect(c?.out).toBe(4);
  });
  it('freeze inserts a held frame and shifts remaining material', () => {
    const parts = insertFreeze(video(), 4);
    const frozen = parts?.find(c => c.freezeAt !== undefined);
    if (!frozen) throw new Error('Missing freeze');
    expect(clipDuration(frozen)).toBe(3);
    expect(sourceTime(frozen, 4)).toBe(4);
    expect(sourceTime(frozen, 6)).toBe(4);
    expect(parts?.[2]?.start).toBe(7);
    expect(parts?.[2]?.in).toBe(4);
  });
});
describe('full color controls', () => {
  it('one stop exposure doubles linear RGB', () => {
    const m = adjustMatrix({ ...defaultEffects(), exposure: 1 });
    expect(m[0]).toBeCloseTo(2); expect(m[5]).toBeCloseTo(2); expect(m[10]).toBeCloseTo(2);
  });
  it('neutral exposure and tint leave colors unchanged', () => {
    expect(isIdent(adjustMatrix({ ...defaultEffects(), exposure: 0, tint: 0 }))).toBe(true);
  });
});