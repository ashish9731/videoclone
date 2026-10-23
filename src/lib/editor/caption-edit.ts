import type { CaptionCue } from './types';

export function editCue(cue: CaptionCue, patch: Partial<CaptionCue>): CaptionCue {
  // the end is resolved first: a drag that moves a cue and stretches it in the same edit must be
  // measured against the end being asked for, not against the end the cue happened to have
  const end = patch.end === undefined || !Number.isFinite(patch.end) ? cue.end : patch.end;
  const start = patch.start === undefined || !Number.isFinite(patch.start) ? cue.start : Math.max(0, Math.min(patch.start, end - 0.1));
  return { ...cue, ...patch, start, end: Math.max(start + 0.1, end) };
}