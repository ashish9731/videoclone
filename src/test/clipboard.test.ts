import { describe, expect, it } from "vitest";
import { clipboardLabel, copySelection, copyTarget, pasteClipboard } from "@/lib/editor/clipboard";
import { EditorStore } from "@/lib/editor/store";
import { shapeClip } from "@/lib/editor/presets";
import {
  type CaptionCue,
  type CaptionTrack,
  type Clip,
  type MediaAsset,
  type Track,
  type TrackKind,
  clipDuration,
  defaultCaptionStyle,
  defaultTextStyle,
  effectClip,
  filterClip,
  textClip,
  clipFromAsset,
} from "@/lib/editor/types";

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: "v",
  name: "Clip.mp4",
  kind: "video",
  storage_path: "x",
  mime: "video/webm",
  size_bytes: 1,
  duration: 10,
  width: 640,
  height: 360,
  project_id: null,
  ...over,
});

/** A shot of an exact length: `in` stays 0, so `out` is the clip's own timeline duration. */
const shot = (start: number, dur: number, id: string): Clip => ({
  ...clipFromAsset(asset(), start),
  id,
  out: dur,
});
const audio = (start: number, dur: number, id: string): Clip => ({
  ...shot(start, dur, id),
  kind: "audio",
  name: "Music",
});
const lane = (
  kind: TrackKind,
  clips: Clip[],
  id = `tr-${kind}`,
  over: Partial<Track> = {},
): Track => ({
  id,
  kind,
  name: kind,
  muted: false,
  hidden: false,
  locked: false,
  clips,
  ...over,
});

const capTrack = (id: string, cues: CaptionCue[]): CaptionTrack => ({
  id,
  project_id: "p1",
  name: "Captions",
  language: "en",
  cues,
  style: defaultCaptionStyle(),
  visible: true,
});

const cue = (id: string, start: number, end: number, text: string): CaptionCue => ({
  id,
  start,
  end,
  text,
});

/**
 * The route owns caption state, so this fake keeps its own list the way `updateCaption` does - a
 * paste has to land in the track the same way a retimed cue does.
 */
function captionsOf(...tracks: CaptionTrack[]) {
  let list = tracks;
  return {
    get tracks() {
      return list;
    },
    update: (id: string, fn: (t: CaptionTrack) => CaptionTrack) => {
      list = list.map((t) => (t.id === id ? fn(t) : t));
    },
    cues: (id: string) => list.find((t) => t.id === id)?.cues ?? [],
  };
}

const CUES = [cue("c1", 1, 3, "Hello there"), cue("c2", 5, 6.5, "Second line")];

/** The id a Copy would take, when the held object is a clip. */
const clipCopied = (store: EditorStore, caps: readonly CaptionTrack[]) => {
  const item = copyTarget(store, caps);
  return item?.type === "clip" ? item.clip.id : null;
};

describe("copying the object the user pointed at", () => {
  it("takes the selected text clip whole, with its look", () => {
    const title = { ...textClip(2), text: { ...defaultTextStyle(), content: "Chapter one" } };
    const store = new EditorStore({ tracks: [lane("text", [title])] });
    store.set({ time: 0, selectedClipId: title.id });
    const item = copyTarget(store, []);
    expect(item?.type).toBe("clip");
    if (item?.type !== "clip") return;
    expect(item.clip.id).toBe(title.id);
    expect(item.clip.text?.content).toBe("Chapter one");
    expect(clipboardLabel(item)).toBe('Text "Chapter one"');
  });

  it("falls back to whatever covers the playhead, so Copy needs no selection step", () => {
    const a = shot(0, 10, "a");
    const store = new EditorStore({ tracks: [lane("video", [a])] });
    store.set({ time: 4 });
    const item = copyTarget(store, []);
    expect(item?.type === "clip" && item.clip.id).toBe(a.id);
  });

  it("reaches an audio hit and an effect block, not only the picture", () => {
    const song = audio(2, 6, "song");
    const block = effectClip("glow", "Glow", 12, 3);
    const store = new EditorStore({ tracks: [lane("effect", [block]), lane("audio", [song])] });
    store.set({ time: 4 });
    expect(clipCopied(store, [])).toBe(song.id);
    store.set({ time: 13 });
    expect(clipCopied(store, [])).toBe(block.id);
  });

  it("takes a transition as its own object once its block is pointed at", () => {
    const b = { ...shot(4, 4, "b"), transitionIn: { type: "dip-black", duration: 1.2 } };
    const store = new EditorStore({ tracks: [lane("video", [shot(0, 4, "a"), b])] });
    store.set({ time: 4, selectedClipId: b.id, selectedTransitionOf: b.id });
    const item = copyTarget(store, []);
    expect(item?.type).toBe("transition");
    if (item?.type !== "transition") return;
    expect(item.transition).toEqual({ type: "dip-black", duration: 1.2 });
    expect(clipboardLabel(item)).toBe("Black fade transition");
  });

  it("takes a caption cue only when the caption lane was pointed at", () => {
    const store = new EditorStore({ tracks: [lane("video", [shot(0, 10, "a")])] });
    const caps = captionsOf(capTrack("cap-1", CUES));
    // the playhead sits inside both a clip and a cue: a click on the cue decides what Copy means
    store.set({ time: 5.5, selectedCueId: "c2" });
    const aimed = copyTarget(store, caps.tracks);
    expect(aimed?.type).toBe("cue");
    if (aimed?.type !== "cue") return;
    expect(aimed.cue.id).toBe("c2");
    expect(clipboardLabel(aimed)).toBe('Caption "Second line"');
    // with nothing pointed at, a cue under the playhead is still worth holding
    store.set({ selectedCueId: null, selectedClipId: "a" });
    expect(clipCopied(store, [])).toBe("a");
  });

  it("holds nothing when the timeline is empty", () => {
    const store = new EditorStore({ tracks: [lane("video", [])] });
    expect(copyTarget(store, [])).toBeNull();
    expect(pasteClipboard(store, captionsOf())).toEqual({ ok: false, reason: "empty" });
  });
});

describe("holding a copy steady", () => {
  it("keeps editing the original after the copy without rewriting what is held", () => {
    const title = { ...textClip(2), text: { ...defaultTextStyle(), content: "Chapter one" } };
    const store = new EditorStore({ tracks: [lane("text", [title])] });
    store.set({ selectedClipId: title.id });
    copySelection(store, []);
    // the editor mutates through new objects, so a held reference would still track the original
    store.updateClip(title.id, (c) => ({
      ...c,
      transform: { ...c.transform, x: 40 },
      text: { ...c.text!, content: "Renamed" },
    }));
    store.set({ time: 20 });
    const result = pasteClipboard(store, captionsOf());
    expect(result.ok).toBe(true);
    const pasted = store
      .get()
      .timeline.tracks.flatMap((t) => t.clips)
      .find((c) => c.id !== title.id)!;
    expect(pasted.text?.content).toBe("Chapter one");
    expect(pasted.transform.x).toBe(0);
  });

  it("survives an undo, which only rolls the timeline back", () => {
    const block = effectClip("glow", "Glow", 0, 3);
    const store = new EditorStore({ tracks: [lane("effect", [block])] });
    store.set({ selectedClipId: block.id, time: 10 });
    copySelection(store, []);
    pasteClipboard(store, captionsOf());
    expect(store.get().timeline.tracks[0]!.clips).toHaveLength(2);
    store.undo();
    expect(store.get().timeline.tracks[0]!.clips).toHaveLength(1);
    expect(store.get().clipboard).not.toBeNull();
    pasteClipboard(store, captionsOf());
    expect(store.get().timeline.tracks[0]!.clips).toHaveLength(2);
  });
});

describe("putting a clip down again", () => {
  it("pastes a copy with its own id at the playhead", () => {
    const sticker = shapeClip("sticker:cat", 2);
    const store = new EditorStore({
      tracks: [lane("text", [sticker], "tr-text"), lane("video", [shot(0, 20, "v")])],
    });
    store.set({ selectedClipId: sticker.id, time: 10 });
    copySelection(store, []);
    const result = pasteClipboard(store, captionsOf());
    expect(result).toMatchObject({ ok: true, kind: "clip", start: 10, trackId: "tr-text" });
    if (!result.ok || result.kind !== "clip") return;
    const pasted = store.findClip(result.id)!.clip;
    expect(pasted.kind).toBe("shape");
    expect(pasted.fx).toEqual(sticker.fx);
    expect(pasted.name).toBe(sticker.name);
    expect(pasted.id).not.toBe(sticker.id);
    // the fresh copy is what the inspector now edits
    expect(store.get().selectedClipId).toBe(result.id);
  });

  it("walks repeated pastes clear of each other instead of stacking a pile", () => {
    const title = textClip(2);
    const store = new EditorStore({ tracks: [lane("text", [title])] });
    store.set({ selectedClipId: title.id, time: 10 });
    copySelection(store, []);
    const first = pasteClipboard(store, captionsOf());
    const second = pasteClipboard(store, captionsOf());
    expect(first.ok && first.kind === "clip" && first.start).toBe(10);
    // the pasted title runs to 14, so the next one has to start there
    expect(second.ok && second.kind === "clip" && second.start).toBe(14);
    const clips = store.get().timeline.tracks[0]!.clips;
    expect(clips).toHaveLength(3);
    expect(clips.map((c) => c.start)).toEqual([2, 10, 14]);
  });

  it("does not move or overwrite what was already on the lane", () => {
    const held = textClip(2);
    const neighbour = { ...textClip(12), text: { ...defaultTextStyle(), content: "Later" } };
    const store = new EditorStore({ tracks: [lane("text", [held, neighbour])] });
    store.set({ selectedClipId: held.id, time: 11 });
    copySelection(store, []);
    const result = pasteClipboard(store, captionsOf());
    expect(result.ok && result.kind === "clip" && result.start).toBe(16);
    expect(store.findClip(neighbour.id)!.clip.start).toBe(12);
    expect(store.findClip(held.id)!.clip.start).toBe(2);
  });

  it("leaves the blend of a copied clip behind, since a joint owns it", () => {
    const b = { ...shot(4, 4, "b"), transitionIn: { type: "fade", duration: 0.5 } };
    const store = new EditorStore({ tracks: [lane("video", [shot(0, 4, "a"), b])] });
    store.set({ selectedClipId: b.id, time: 12 });
    copySelection(store, []);
    const result = pasteClipboard(store, captionsOf());
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "clip") return;
    expect(store.findClip(result.id)!.clip.transitionIn).toBeUndefined();
    expect(store.findClip("b")!.clip.transitionIn).toEqual({ type: "fade", duration: 0.5 });
  });

  it("keeps an effect block, a grade and a sticker on their own kind of lane", () => {
    const block = effectClip("glow", "Glow", 0, 3);
    const grade = filterClip("teal", "Teal", 6, 3);
    const sticker = shapeClip("sticker:star", 12);
    const store = new EditorStore({
      tracks: [
        lane("text", [sticker], "tr-text"),
        lane("filter", [grade]),
        lane("effect", [block]),
        lane("video", [shot(0, 30, "v")]),
      ],
    });
    const copyOf = (clip: Clip, time: number) => {
      store.set({ selectedClipId: clip.id, time });
      copySelection(store, []);
      return pasteClipboard(store, captionsOf());
    };
    const e = copyOf(block, 20);
    const f = copyOf(grade, 24);
    const s = copyOf(sticker, 28);
    const laneOf = (id: string) =>
      store.get().timeline.tracks.find((t) => t.clips.some((c) => c.id === id))!;
    expect(e.ok && e.kind === "clip" && laneOf(e.id).kind).toBe("effect");
    expect(f.ok && f.kind === "clip" && laneOf(f.id).kind).toBe("filter");
    expect(s.ok && s.kind === "clip" && laneOf(s.id).kind).toBe("text");
    // a grade block carries the reference the renderer colours with
    const pastedGrade = f.ok && f.kind === "clip" ? store.findClip(f.id)!.clip : null;
    expect(pastedGrade?.filter).toEqual(grade.filter);
  });

  it("crosses to a free lane of its kind when the source row is locked", () => {
    const held = shot(0, 4, "a");
    const other = shot(8, 4, "b");
    const store = new EditorStore({
      tracks: [
        lane("video", [held], "locked-lane", { locked: true }),
        lane("video", [other], "open-lane"),
      ],
    });
    store.set({ selectedClipId: held.id, time: 0 });
    copySelection(store, []);
    const result = pasteClipboard(store, captionsOf());
    expect(result.ok && result.kind === "clip" && result.trackId).toBe("open-lane");
    // measured on the lane that receives it: 0 is free there, and 8 is not
    expect(result.ok && result.kind === "clip" && result.start).toBe(0);
    expect(store.get().timeline.tracks.find((t) => t.id === "locked-lane")!.clips).toHaveLength(1);
  });

  it("opens a fresh row when the kind has none left to paste onto", () => {
    const held = shot(0, 4, "a");
    const store = new EditorStore({
      tracks: [lane("video", [held], "locked-lane", { locked: true })],
    });
    store.set({ selectedClipId: held.id, time: 6 });
    copySelection(store, []);
    const result = pasteClipboard(store, captionsOf());
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "clip") return;
    expect(store.get().timeline.tracks).toHaveLength(2);
    const created = store
      .get()
      .timeline.tracks.find((t) => t.clips.some((c) => c.id === result.id))!;
    expect(created.locked).toBe(false);
    expect(created.clips[0]!.start).toBe(6);
  });
});

describe("putting a transition down on another joint", () => {
  /** two seams on one lane: a..b at 4s, c..d at 14s, and the blend only exists on the first */
  const seams = () => {
    const b = { ...shot(4, 4, "b"), transitionIn: { type: "dip-black", duration: 1 } };
    const track = lane("video", [shot(0, 4, "a"), b, shot(10, 4, "c"), shot(14, 4, "d")]);
    return new EditorStore({ tracks: [track] });
  };

  const copyBlend = (store: EditorStore) => {
    store.set({ time: 4, selectedClipId: "b", selectedTransitionOf: "b" });
    copySelection(store, []);
  };

  it("applies the copied blend to the seam under the playhead", () => {
    const store = seams();
    copyBlend(store);
    store.set({ time: 14, selectedClipId: null, selectedTransitionOf: null });
    const result = pasteClipboard(store, captionsOf());
    expect(result).toEqual({ ok: true, kind: "transition", id: "d", clamped: false });
    expect(store.findClip("d")!.clip.transitionIn).toEqual({ type: "dip-black", duration: 1 });
    // the paste leaves the new blend selected, exactly as clicking a block would
    expect(store.get().selectedTransitionOf).toBe("d");
    expect(store.get().inspectorTab).toBe("trans");
    // and the joint it came from keeps its own blend
    expect(store.findClip("b")!.clip.transitionIn).toEqual({ type: "dip-black", duration: 1 });
  });

  it("shortens a long blend to what the joint allows", () => {
    // the 5s zoom sits on the roomy first seam; the second seam joins two 4s shots
    const b = { ...shot(8, 8, "b"), transitionIn: { type: "zoom-in", duration: 5 } };
    const store = new EditorStore({
      tracks: [lane("video", [shot(0, 8, "a"), b, shot(16, 4, "c"), shot(20, 4, "d")])],
    });
    store.set({ time: 8, selectedClipId: "b", selectedTransitionOf: "b" });
    copySelection(store, []);
    store.set({ time: 20, selectedClipId: null, selectedTransitionOf: null });
    const result = pasteClipboard(store, captionsOf());
    expect(result.ok && result.kind === "transition" && result.clamped).toBe(true);
    // maxTransitionDuration caps at the shorter neighbour's 90%: 4 * 0.9
    expect(store.findClip("d")!.clip.transitionIn).toEqual({ type: "zoom-in", duration: 3.6 });
    expect(store.findClip("b")!.clip.transitionIn).toEqual({ type: "zoom-in", duration: 5 });
  });

  it("aims at the selected clip\u2019s own joint when the playhead sits elsewhere", () => {
    const store = seams();
    copyBlend(store);
    store.set({ time: 30, selectedClipId: "d" });
    const result = pasteClipboard(store, captionsOf());
    expect(result).toMatchObject({ ok: true, kind: "transition", id: "d" });
    expect(store.findClip("d")!.clip.transitionIn?.type).toBe("dip-black");
  });

  it("refuses a lone clip with no joint and leaves the timeline as it was", () => {
    const lone = shot(0, 8, "a");
    const store = new EditorStore({ tracks: [lane("video", [lone])] });
    // a clip that carries no blend has no blend to take, so Copy holds the clip instead
    store.set({ time: 0, selectedClipId: "a", selectedTransitionOf: "a" });
    expect(copySelection(store, [])?.type).toBe("clip");
    // hold a transition the way an earlier seam would have left it, then look for a joint
    store.set({
      clipboard: { type: "transition", transition: { type: "dip-black", duration: 1 } },
    });
    const before = JSON.stringify(store.get().timeline);
    expect(pasteClipboard(store, captionsOf())).toEqual({ ok: false, reason: "no-seam" });
    expect(JSON.stringify(store.get().timeline)).toBe(before);
    expect(store.findClip("a")!.clip.transitionIn).toBeUndefined();
  });
});

describe("putting a caption line down again", () => {
  it("pastes the phrase clear of the cues already on its track, in time order", () => {
    const store = new EditorStore({ tracks: [lane("video", [shot(0, 20, "v")])] });
    const caps = captionsOf(capTrack("cap-1", CUES));
    store.set({ time: 5, selectedCueId: "c1" });
    copySelection(store, caps.tracks);
    const result = pasteClipboard(store, caps);
    expect(result).toMatchObject({ ok: true, kind: "cue", trackId: "cap-1" });
    if (!result.ok || result.kind !== "cue") return;
    const cues = caps.cues("cap-1");
    expect(cues).toHaveLength(3);
    // 5..7 is taken by "Second line", so the pasted one steps to the next free moment
    expect(cues.map((c) => [c.start, c.end])).toEqual([
      [1, 3],
      [5, 6.5],
      [6.5, 8.5],
    ]);
    expect(cues[2]!.text).toBe("Hello there");
    // the new cue is the aimed one and the preview lands on it
    expect(store.get().selectedCueId).toBe(result.id);
    expect(store.get().time).toBe(6.5);
  });

  it("lands on another caption track when the cue\u2019s own track is gone", () => {
    const store = new EditorStore({ tracks: [] });
    const caps = captionsOf(capTrack("cap-2", []));
    store.set({ time: 2 });
    store.set({ clipboard: { type: "cue", cue: cue("c1", 0, 2, "Orphan"), trackId: "cap-1" } });
    const result = pasteClipboard(store, caps);
    expect(result).toMatchObject({ ok: true, kind: "cue", trackId: "cap-2" });
    expect(caps.cues("cap-2")).toHaveLength(1);
  });

  it("says the line is gone when the project has no captions left", () => {
    const store = new EditorStore({ tracks: [] });
    store.set({ clipboard: { type: "cue", cue: cue("c1", 0, 2, "Orphan"), trackId: "cap-1" } });
    expect(pasteClipboard(store, captionsOf())).toEqual({ ok: false, reason: "no-track" });
  });

  it("keeps a pasted cue long enough for the caption editor to treat it as active", () => {
    const store = new EditorStore({ tracks: [] });
    const caps = captionsOf(capTrack("cap-1", []));
    store.set({ time: 4 });
    // a degenerate cue must not come back degenerate: editCue floors it at 0.1s
    store.set({ clipboard: { type: "cue", cue: cue("c1", 0, 0, "Ping"), trackId: "cap-1" } });
    const result = pasteClipboard(store, caps);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "cue") return;
    const pasted = caps.cues("cap-1")[0]!;
    expect(pasted.end - pasted.start).toBeCloseTo(0.1, 5);
    expect(pasted.start).toBeGreaterThanOrEqual(0);
  });
});

describe("copy semantics that the renderer depends on", () => {
  it("copies a clip\u2019s speed and duration whole so the paste holds the same span", () => {
    const fast = { ...shot(0, 8, "a"), speed: 2 };
    const store = new EditorStore({ tracks: [lane("video", [fast])] });
    store.set({ selectedClipId: fast.id, time: 20 });
    copySelection(store, []);
    const result = pasteClipboard(store, captionsOf());
    expect(result.ok && result.kind === "clip" && result.start).toBe(20);
    if (!result.ok || result.kind !== "clip") return;
    const pasted = store.findClip(result.id)!.clip;
    expect(pasted.speed).toBe(2);
    expect(clipDuration(pasted)).toBeCloseTo(clipDuration(fast), 5);
  });

  it("names every kind of held object so the paste button can say what it will do", () => {
    const store = new EditorStore({ tracks: [] });
    const label = (item: Parameters<typeof clipboardLabel>[0]) => clipboardLabel(item);
    expect(
      label({
        type: "clip",
        clip: { ...textClip(0), text: { ...defaultTextStyle(), content: "Hi" } },
        trackId: "t",
      }),
    ).toBe('Text "Hi"');
    expect(label({ type: "clip", clip: effectClip("glow", "Glow", 0, 1), trackId: "t" })).toBe(
      "Effect Glow",
    );
    expect(label({ type: "clip", clip: filterClip("teal", "Teal", 0, 1), trackId: "t" })).toBe(
      "Filter Teal",
    );
    expect(label({ type: "clip", clip: shapeClip("sticker:cat", 0), trackId: "t" })).toBe(
      "Sticker:cat",
    );
    expect(label({ type: "clip", clip: audio(0, 1, "a"), trackId: "t" })).toBe("Music");
    expect(label({ type: "transition", transition: { type: "fade", duration: 1 } })).toBe(
      "Mix transition",
    );
    expect(label({ type: "cue", cue: cue("c", 0, 1, "Line"), trackId: "t" })).toBe(
      'Caption "Line"',
    );
  });
});
