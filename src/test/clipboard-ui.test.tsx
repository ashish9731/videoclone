import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// sonner's export is called both as `toast(...)` and as `toast.info(...)`; the timeline uses both.
const sonner = vi.hoisted(() =>
  Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn() }),
);
vi.mock("sonner", () => ({ toast: sonner }));

import { EditorStore } from "@/lib/editor/store";
import {
  type CaptionCue,
  type CaptionTrack,
  type Clip,
  type Track,
  type TrackKind,
  type Timeline,
  defaultCaptionStyle,
  effectClip,
} from "@/lib/editor/types";
import { Timeline as TimelineUI } from "@/components/editor/Timeline";

// Radix (Slider, ContextMenu) measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// Radix Menu guards its pointer handling on capture/scroll APIs that jsdom does not implement.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

const PPS = 60;
const HEADER_W = 168;

const clip = (
  kind: Clip["kind"],
  start: number,
  dur: number,
  id: string,
  over: Partial<Clip> = {},
): Clip => ({
  ...effectClip("glow", "clip", start, dur),
  id,
  kind,
  ...over,
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

const tl = (tracks: Track[]): Timeline => ({ tracks });

const cue = (id: string, start: number, end: number, text: string): CaptionCue => ({
  id,
  start,
  end,
  text,
});
const CUES = [cue("c1", 1, 3, "Hello there"), cue("c2", 5, 6.5, "Second line")];
const capTrack = (cues: CaptionCue[]): CaptionTrack => ({
  id: "cap-1",
  project_id: "p1",
  name: "Auto captions",
  language: "en",
  cues,
  style: defaultCaptionStyle(),
  visible: true,
});

/**
 * One lane holding two joined shots (a|b carries the fade) and a second joint a paste can be
 * aimed at (c|d), plus a caption track whose cues fall over that picture.
 */
const shots = () => [
  clip("video", 0, 4, "a"),
  clip("video", 4, 4, "b", { transitionIn: { type: "fade", duration: 0.8 } }),
  clip("video", 10, 4, "c"),
  clip("video", 14, 4, "d"),
];

function setup(tracks: Track[] = [lane("video", shots())], withCaptions = true) {
  const store = new EditorStore(tl(tracks));
  // the route owns caption state, so the fake callback keeps its own copy of the track
  let track = capTrack(CUES);
  const onUpdate = vi.fn((id: string, fn: (t: CaptionTrack) => CaptionTrack) => {
    track = fn(track);
  });
  const view = render(
    <TimelineUI
      store={store}
      assets={new Map()}
      captions={withCaptions ? [track] : []}
      onUpdateCaption={withCaptions ? onUpdate : undefined}
    />,
  );
  const all = () => store.get().timeline.tracks.flatMap((t) => t.clips);
  const clipOf = (id: string) => all().find((c) => c.id === id)!;
  return {
    store,
    onUpdate,
    clipOf,
    all,
    cuesOf: () => track.cues,
    copyBtn: view.getByRole("button", { name: "Copy" }),
    pasteBtn: view.getByRole("button", { name: "Paste" }),
    cueEl: (id: string) => view.container.querySelector(`[data-caption-cue="${id}"]`),
    blockEl: (id: string) => view.container.querySelector(`[data-clip-id="${id}"]`),
    seamEl: view.container.querySelector('[data-transition-for="b"]')!,
    videoLane: view.container.querySelector('[data-track-id="tr-video"]')!,
    ruler: view.container.querySelector("[data-ruler]")!,
  };
}

// jsdom has no PointerEvent constructor, and the lane's drag listeners only read the pointer's x.
const pointer = (type: string, clientX = 0, button = 0) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100, button });
const down = (el: Element | null, clientX = 0, button = 0) =>
  fireEvent(el!, pointer("pointerdown", clientX, button));
const up = () => fireEvent(window, pointer("pointerup"));
// dispatched on the body so the shortcut handler's target guard sees an element, as in a browser
const hot = (key: string) =>
  fireEvent.keyDown(document.body, { key, ctrlKey: true, code: `Key${key.toUpperCase()}` });
const seekTo = (store: EditorStore, time: number) => act(() => store.set({ time, playing: false }));

beforeEach(() => {
  sonner.mockClear();
  sonner.info.mockClear();
  sonner.success.mockClear();
});

describe("the Copy and Paste buttons", () => {
  it("offers Paste only once an object is held", () => {
    const { copyBtn, pasteBtn } = setup();
    expect(pasteBtn).toBeDisabled();
    expect(pasteBtn.getAttribute("title")).toContain("nothing copied yet");
    fireEvent.click(copyBtn);
    expect(pasteBtn).toBeEnabled();
    expect(pasteBtn.getAttribute("title")).toContain("at the playhead");
  });

  it("copies what the playhead is on and puts a second one down at the playhead", () => {
    const { store, copyBtn, pasteBtn, all } = setup();
    expect(copyBtn).toBeEnabled();
    // the playhead sits inside shot b, the one carrying the blend
    seekTo(store, 6);
    fireEvent.click(copyBtn);
    expect(sonner.success).toHaveBeenCalledWith(
      expect.stringContaining("Copied"),
      expect.anything(),
    );
    expect(pasteBtn).toBeEnabled();
    expect(pasteBtn.getAttribute("title")).toContain("at the playhead");

    seekTo(store, 20);
    fireEvent.click(pasteBtn);
    expect(all()).toHaveLength(5);
    const pasted = all().find((c) => !["a", "b", "c", "d"].includes(c.id))!;
    expect(pasted.start).toBe(20);
    expect(pasted.kind).toBe("video");
    // the blend belongs to the joint it came from, so the copy arrives without one
    expect(pasted.transitionIn).toBeUndefined();
    expect(store.findClip("b")!.clip.transitionIn).toBeDefined();
  });

  it("keeps its button dark when the project holds nothing to copy", () => {
    const { copyBtn, pasteBtn } = setup([lane("video", [])], false);
    expect(copyBtn).toBeDisabled();
    expect(pasteBtn).toBeDisabled();
  });

  it("says to point at something when the playhead sits on empty track", () => {
    const { store, copyBtn } = setup();
    seekTo(store, 40);
    fireEvent.click(copyBtn);
    expect(sonner.success).not.toHaveBeenCalled();
    expect(sonner.info).toHaveBeenCalledWith("Nothing to copy", expect.anything());
    expect(store.get().clipboard).toBeNull();
  });
});

describe("Ctrl+C and Ctrl+V on the timeline", () => {
  it("copies the selected clip and pastes it at the playhead", () => {
    const { store, all, blockEl } = setup();
    down(blockEl("c"), HEADER_W + 10 * PPS);
    up();
    expect(store.get().selectedClipId).toBe("c");
    seekTo(store, 24);
    hot("c");
    hot("v");
    expect(all()).toHaveLength(5);
    const pasted = all().at(-1)!;
    expect(pasted.start).toBe(24);
    expect(pasted.id).not.toBe("c");
  });

  it("copies a transition block as its own object and blends another joint with it", () => {
    const { store, clipOf, seamEl } = setup();
    down(seamEl, 0);
    up();
    expect(store.get().selectedTransitionOf).toBe("b");
    hot("c");
    expect(sonner.success).toHaveBeenCalledWith("Copied Mix transition", expect.anything());

    // the held blend goes to the other joint, which had none
    expect(clipOf("d").transitionIn).toBeUndefined();
    seekTo(store, 14);
    hot("v");
    expect(clipOf("d").transitionIn).toEqual({ type: "fade", duration: 0.8 });
    expect(store.get().selectedTransitionOf).toBe("d");
    // and the seam it came from still holds its own blend
    expect(clipOf("b").transitionIn).toEqual({ type: "fade", duration: 0.8 });
  });

  it("tells the user when a pasted blend has to shorten itself for the joint", () => {
    const long = [
      clip("video", 0, 8, "a"),
      clip("video", 8, 8, "b", { transitionIn: { type: "fade", duration: 5 } }),
      clip("video", 16, 4, "c"),
      clip("video", 20, 4, "d"),
    ];
    const { store, clipOf } = setup([lane("video", long)]);
    // an external store update has to be flushed through React before the lane repaints
    act(() => store.set({ time: 8, selectedClipId: "b", selectedTransitionOf: "b" }));
    hot("c");
    seekTo(store, 20);
    hot("v");
    expect(clipOf("d").transitionIn).toEqual({ type: "fade", duration: 3.6 });
    expect(sonner.success).toHaveBeenCalledWith(
      expect.stringContaining("shortened to fit"),
      expect.anything(),
    );
  });

  it("escapes clear both a clip and a caption line", () => {
    const { store, cueEl, blockEl } = setup();
    down(blockEl("a"), HEADER_W);
    up();
    expect(store.get().selectedClipId).toBe("a");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(store.get().selectedClipId).toBeNull();

    down(cueEl("c1"), HEADER_W + PPS);
    up();
    expect(store.get().selectedCueId).toBe("c1");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(store.get().selectedCueId).toBeNull();
  });
});

describe("copying a caption line from its own lane", () => {
  it("aims at the cue the user clicked rather than the picture under it", () => {
    const { store, cueEl, onUpdate, cuesOf } = setup();
    // the cue runs 5 - 6.5, straight over shot b, so only the click decides what Copy means
    down(cueEl("c2"), HEADER_W + 5 * PPS);
    up();
    expect(store.get().selectedCueId).toBe("c2");
    hot("c");
    expect(sonner.success).toHaveBeenCalledWith('Copied Caption "Second line"', expect.anything());

    hot("v");
    expect(onUpdate).toHaveBeenCalledWith("cap-1", expect.any(Function));
    const cues = cuesOf();
    expect(cues).toHaveLength(3);
    expect(cues[2]).toMatchObject({ start: 6.5, end: 8, text: "Second line" });
    expect(cues[2]!.id).not.toBe("c2");
  });

  it("deletes the aimed caption line with the same key that deletes a clip", () => {
    const { store, cueEl, cuesOf } = setup();
    down(cueEl("c1"), HEADER_W + PPS);
    up();
    expect(cuesOf()).toHaveLength(2);
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(cuesOf().map((c) => c.id)).toEqual(["c2"]);
    expect(store.get().selectedCueId).toBeNull();
  });
});

describe("a block’s right-click menu", () => {
  // Radix only opens a context menu for a pointer whose right button went down, so the event has to
  // carry `button: 2` - exactly what the browser sends and what the drag guards ignore.
  const openMenu = (el: Element | null) =>
    fireEvent(
      el!,
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: HEADER_W + 10,
        clientY: 100,
      }),
    );

  it("copies the block the menu was opened on, not whatever was selected before", async () => {
    const { store, blockEl, all } = setup();
    // aim at another shot first: the menu item has to override it, or Copy would take the wrong clip
    act(() => store.set({ selectedClipId: "d", time: 15 }));
    openMenu(blockEl("a"));
    const copy = await screen.findByRole("menuitem", { name: /^Copy/ });
    fireEvent.click(copy);
    expect(sonner.success).toHaveBeenCalledWith(
      expect.stringContaining("Copied"),
      expect.anything(),
    );
    const held = store.get().clipboard;
    expect(held?.type).toBe("clip");
    if (held?.type !== "clip") return;
    expect(held.clip.id).toBe("a");

    // the menu closes on selection, exactly like a native one, so it is opened again to paste
    seekTo(store, 24);
    openMenu(blockEl("a"));
    const paste = await screen.findByRole("menuitem", { name: /Paste at playhead/ });
    fireEvent.click(paste);
    expect(all()).toHaveLength(5);
    expect(all().at(-1)!.start).toBe(24);
  });

  it("copies a transition from its block menu so another joint can be blended with it", async () => {
    const { store, clipOf, seamEl, pasteBtn } = setup();
    act(() => store.set({ time: 15, selectedClipId: "a" }));
    openMenu(seamEl);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Copy transition/ }));
    expect(store.get().clipboard?.type).toBe("transition");
    expect(clipOf("d").transitionIn).toBeUndefined();

    // the copied blend is a reusable object: aim the playhead at the other joint and put it there
    seekTo(store, 14);
    fireEvent.click(pasteBtn);
    expect(clipOf("d").transitionIn).toEqual({ type: "fade", duration: 0.8 });
  });
});

describe("right-button guards that make a block menu usable", () => {
  it("does not drag the playhead out of a lane when the menu is what was asked for", () => {
    const { store, videoLane, ruler } = setup();
    // a left click on the ruler seeks, so the guard cannot simply be a broken handler
    down(ruler, HEADER_W + 2 * PPS, 0);
    up();
    expect(store.get().time).toBeCloseTo(2, 5);

    seekTo(store, 2);
    down(videoLane, HEADER_W + 6 * PPS, 2);
    up();
    expect(store.get().time).toBeCloseTo(2, 5);
    expect(store.get().selectedClipId).toBeNull();
  });

  it("does not retime a clip that the menu was opened on", () => {
    const { store, blockEl } = setup();
    const before = JSON.stringify(store.get().timeline);
    down(blockEl("a"), HEADER_W, 2);
    up();
    expect(JSON.stringify(store.get().timeline)).toBe(before);
    expect(store.get().selectedClipId).toBeNull();
  });

  it("does not stretch a blend whose block the menu was opened on", () => {
    const { store, seamEl, clipOf } = setup();
    down(seamEl, 0, 2);
    up();
    expect(clipOf("b").transitionIn).toEqual({ type: "fade", duration: 0.8 });
    expect(store.get().selectedTransitionOf).toBeNull();
  });
});
