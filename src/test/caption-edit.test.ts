import { expect, it } from 'vitest';
import { editCue } from '@/lib/editor/caption-edit';
const cue = { id: 'cue', start: 1, end: 3, text: 'Hello' };
it('editable start remains before the end so captions stay visible', () => {
  expect(editCue(cue, { start: 5 }).start).toBeCloseTo(2.9);
});
it('editable end remains after the start', () => {
  expect(editCue(cue, { end: 0 }).end).toBeCloseTo(1.1);
});
it('invalid time input preserves the valid cue', () => {
  expect(editCue(cue, { start: NaN, end: Infinity })).toEqual(cue);
});