import { describe, expect, it } from "vitest";
import { clipDuration, interpolate, splitClip, textClip, cuesToSrt } from "@/lib/editor/types";
import { detectSpeechSegments, splitCueText } from "@/lib/editor/transcribe-client";

describe("editor rules", () => {
  it("speed 2x halves the clip's timeline length", () => {
    expect(clipDuration({ in: 2, out: 12, speed: 2 })).toBe(5);
  });

  it("splitting keeps both halves contiguous in source and timeline", () => {
    const c = { ...textClip(10), in: 0, out: 4 };
    const parts = splitClip(c, 11.5)!;
    expect(parts[0].out).toBeCloseTo(1.5);
    expect(parts[1].in).toBeCloseTo(1.5);
    expect(parts[1].start).toBe(11.5);
    expect(parts[1].id).not.toBe(parts[0].id);
  });

  it("split outside the clip is refused", () => {
    expect(splitClip(textClip(0), 10)).toBeNull();
  });

  it("keyframes hold their end values and interpolate between", () => {
    const f = [
      { t: 0, value: 0 },
      { t: 2, value: 100 },
    ];
    expect(interpolate(f, -1, 5)).toBe(0);
    expect(interpolate(f, 1, 5)).toBeCloseTo(50);
    expect(interpolate(f, 3, 5)).toBe(100);
    expect(interpolate(undefined, 1, 5)).toBe(5);
  });

  it("SRT export uses comma milliseconds", () => {
    expect(cuesToSrt([{ id: "a", start: 1.5, end: 3, text: "Hi" }])).toContain("00:00:01,500 --> 00:00:03,000");
  });

  it("speech detection finds a tone burst between silences", () => {
    const sr = 16000;
    const s = new Float32Array(sr * 4);
    for (let i = sr; i < sr * 2.5; i++) s[i] = 0.3 * Math.sin(i / 5);
    const segs = detectSpeechSegments(s, sr);
    expect(segs.length).toBe(1);
    expect(segs[0]!.start).toBeGreaterThan(0.8);
    expect(segs[0]!.end).toBeLessThan(2.8);
  });

  it("long transcripts split into short contiguous cues", () => {
    const parts = splitCueText(1, 7, "Hello and welcome to the editor. This is a quick test of automatic captions. Thanks for watching.");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.text.length <= 42)).toBe(true);
    expect(parts[0]!.start).toBe(1);
    expect(parts[parts.length - 1]!.end).toBeCloseTo(7);
  });
});

import { applyAnimated } from "@/lib/editor/keyframes";
describe("canvas transform keyframing", () => {
  it("without keyframes or recording, dragging changes the static position", () => {
    const c = applyAnimated(textClip(0), 1, { x: 200 }, false);
    expect(c.transform.x).toBe(200);
    expect(c.keyframes.x).toBeUndefined();
  });
  it("in record mode, dragging adds a keyframe at the playhead", () => {
    let c = applyAnimated(textClip(0), 0, { x: 0 }, true);
    c = applyAnimated(c, 2, { x: 300 }, true);
    expect(c.keyframes.x).toEqual([{ t: 0, value: 0 }, { t: 2, value: 300 }]);
  });
  it("a prop that already has keyframes keeps animating even with record off", () => {
    let c = applyAnimated(textClip(0), 0, { rotation: 10 }, true);
    c = applyAnimated(c, 0, { rotation: 45 }, false);
    expect(c.keyframes.rotation).toEqual([{ t: 0, value: 45 }]);
  });
});

import { sourceTime, speedAt, clipFromAsset } from "@/lib/editor/types";
import { clipGainAt } from "@/lib/editor/audio-fx";
import { outgoingTail, prevAdjacent } from "@/lib/editor/transitions";
import { IDENT, adjustMatrix, clipColorMatrix, isIdent } from "@/lib/editor/fx";
import { defaultEffects } from "@/lib/editor/types";

const vid = (start: number, len: number) =>
  clipFromAsset({ id: "a", storage_path: "x", name: "v", kind: "video", mime: "video/mp4", size_bytes: 1, duration: len, width: 1920, height: 1080, project_id: null }, start);

describe("speed ramps", () => {
  it("a constant 2x curve halves the clip length like 2x speed", () => {
    const c = { ...vid(0, 10), speedCurve: [{ t: 0, speed: 2 }, { t: 1, speed: 2 }] };
    expect(clipDuration(c)).toBeCloseTo(5);
  });
  it("ramp 1x→3x averages 2x, and source time reaches the out point at the clip end", () => {
    const c = { ...vid(0, 10), speedCurve: [{ t: 0, speed: 1 }, { t: 1, speed: 3 }] };
    const d = clipDuration(c);
    expect(d).toBeCloseTo(5);
    expect(sourceTime(c, d)).toBeCloseTo(10);
    expect(speedAt(c, 0)).toBeCloseTo(1);
    expect(speedAt(c, d)).toBeCloseTo(3);
    // slow start: first half of the clip covers less than half the source
    expect(sourceTime(c, d / 2)).toBeLessThan(5);
  });
  it("splitting a ramped clip keeps source and timeline continuous", () => {
    const c = { ...vid(0, 10), speedCurve: [{ t: 0, speed: 1 }, { t: 1, speed: 3 }] };
    const [l, r] = splitClip(c, 2)!;
    expect(clipDuration(l)).toBeCloseTo(2);
    expect(r.start).toBe(2);
    expect(l.out).toBeCloseTo(r.in);
    expect(clipDuration(l) + clipDuration(r)).toBeCloseTo(5);
  });
});

describe("audio ducking and fades", () => {
  it("music with 70% ducking plays at 30% while another clip plays, full volume otherwise", () => {
    const music = { ...vid(0, 20), kind: "audio" as const, duck: 0.7 };
    const voice = vid(5, 5);
    expect(clipGainAt(music, 2, [voice])).toBeCloseTo(1);
    expect(clipGainAt(music, 7, [voice])).toBeCloseTo(0.3);
    expect(clipGainAt(music, 15, [voice])).toBeCloseTo(1);
  });
  it("a 1s fade in starts silent and is half volume at 0.5s", () => {
    const c = { ...vid(0, 10), fadeIn: 1 };
    expect(clipGainAt(c, 0, null)).toBe(0);
    expect(clipGainAt(c, 0.5, null)).toBeCloseTo(0.5);
  });
});

describe("transitions between clips", () => {
  it("a transition on the second of two touching clips keeps the first visible for its duration", () => {
    const a = vid(0, 4);
    const b = { ...vid(4, 4), transitionIn: { type: "fade", duration: 0.8 } };
    const track = { id: "t", kind: "video" as const, name: "V", muted: false, hidden: false, locked: false, clips: [a, b] };
    expect(prevAdjacent(track, b)?.id).toBe(a.id);
    expect(outgoingTail(track, a)).toBeCloseTo(0.8);
    expect(outgoingTail(track, b)).toBe(0);
  });
});

describe("color pipeline", () => {
  it("default adjustments change nothing; a filter at 0% intensity changes nothing", () => {
    expect(isIdent(adjustMatrix(defaultEffects()))).toBe(true);
    expect(isIdent(clipColorMatrix(defaultEffects(), { id: "noir", intensity: 0 }).m)).toBe(true);
    expect(isIdent(clipColorMatrix(defaultEffects(), { id: "noir", intensity: 100 }).m)).toBe(false);
    expect(IDENT.length).toBe(12);
  });
});
