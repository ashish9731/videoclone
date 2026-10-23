import { describe, expect, it } from 'vitest';
import { parseSubtitles } from '@/lib/editor/types';
import { ART_STICKERS } from '@/lib/editor/stickers';
import { EFFECTS } from '@/lib/editor/fx';
import { TRANSITIONS } from '@/lib/editor/transitions';

describe('subtitle import', () => {
  it('parses SubRip (.srt) cues with comma milliseconds', () => {
    const srt = `1\n00:00:01,000 --> 00:00:03,500\nHello world\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond line\nmore text\n`;
    const cues = parseSubtitles(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.start).toBeCloseTo(1);
    expect(cues[0]!.end).toBeCloseTo(3.5);
    expect(cues[0]!.text).toBe('Hello world');
    expect(cues[1]!.text).toBe('Second line\nmore text');
  });

  it('parses WebVTT with dot milliseconds, header and inline tags', () => {
    const vtt = `WEBVTT\n\n00:00.500 --> 00:02.000\n<v Speaker>Hi <c.blue>there</c></v>\n`;
    const cues = parseSubtitles(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.start).toBeCloseTo(0.5);
    expect(cues[0]!.end).toBeCloseTo(2);
    expect(cues[0]!.text).toBe('Hi there');
  });

  it('handles hours, CRLF and a BOM, skipping malformed blocks', () => {
    const messy = `1\n01:00:00,000 --> 01:00:02,000\nLate cue\r\n\r\nnot a cue\r\n\r\n3\nbroken --> time\nskip\n`;
    const cues = parseSubtitles('\uFEFF' + messy);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.start).toBeCloseTo(3600);
    expect(cues[0]!.text).toBe('Late cue');
  });

  it('returns sorted cues and nothing for empty input', () => {
    expect(parseSubtitles('')).toEqual([]);
    const srt = `2\n00:00:05,000 --> 00:00:06,000\nB\n\n1\n00:00:01,000 --> 00:00:02,000\nA\n`;
    const cues = parseSubtitles(srt);
    expect(cues.map((c) => c.text)).toEqual(['A', 'B']);
  });
});

describe('catalog integrity', () => {
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  it('sticker, effect and transition ids are unique within each catalog', () => {
    expect(unique(ART_STICKERS.map((s) => s.id))).toBe(true);
    expect(unique(EFFECTS.map((e) => e.id))).toBe(true);
    expect(unique(TRANSITIONS.map((t) => t.id))).toBe(true);
  });

  it('every sticker and transition belongs to a known group', () => {
    const stickerGroups = new Set<string>(ART_STICKERS.map((s) => s.group));
    expect(stickerGroups.size).toBeGreaterThan(4);
    const transitionGroups = new Set(['Basic', 'Slide', 'Wipe', 'Camera', 'Effects', 'Shape', '3D', 'Film', 'Flash']);
    for (const t of TRANSITIONS) expect(transitionGroups.has(t.group)).toBe(true);
  });
});
