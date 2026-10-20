import type { CaptionCue } from './types';

export function editCue(cue: CaptionCue, patch: Partial<CaptionCue>): CaptionCue {
  const start = patch.start === undefined || !Number.isFinite(patch.start) ? cue.start : Math.max(0, Math.min(patch.start, cue.end - 0.1));
  const end = patch.end === undefined || !Number.isFinite(patch.end) ? cue.end : Math.max(start + 0.1, patch.end);
  return { ...cue, ...patch, start, end };
}