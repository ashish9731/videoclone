import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorStore } from "@/lib/editor/store";
import { maxTransitionDuration, transitionInSpan } from "@/lib/editor/transitions";
import {
  type Clip,
  type Track,
  type TrackKind,
  type Timeline,
  clipDuration,
  effectClip,
  timelineDuration,
} from "@/lib/editor/types";
import { Timeline as TimelineUI } from "@/components/editor/Timeline";

// Radix (Slider, DropdownMenu) measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const PPS = 60;

const clip = (kind: Clip["kind"], start: number, dur: number, id?: string): Clip => ({
  ...effectClip("glow", "clip", start, dur),
  id: id ?? `${kind}-${start}`,
  kind,
});

const lane = (kind: TrackKind, clips: Clip[], id = `tr-${kind}`): Track => ({
  id,
  kind,
  name: kind,
  muted: false,
  hidden: false,
  locked: false,
  clips,
});

const tl = (tracks: Track[]): Timeline => ({ tracks });

/** Two touching 4s clips with a 0.8s fade blended over the head of the second. */
function joined(dur = 0.8) {
  const a = clip("video", 0, 4, "a");
  const b = { ...clip("video", 4, 4, "b"), transitionIn: { type: "fade", duration: dur } };
  return new EditorStore(tl([lane("video", [a, b])]));
}

const box = (el: Element | null) => {
  const s = (el as HTMLElement).style;
  return {
    left: parseFloat(s.left),
    width: parseFloat(s.width),
    right: parseFloat(s.left) + parseFloat(s.width),
  };
};

const seamOf = (store: EditorStore) =>
  store.get().timeline.tracks[0]!.clips.find((c) => c.id === "b")!.transitionIn;

// jsdom has no PointerEvent constructor, and the timeline's drag listeners only ever read the
// pointer's x, so a MouseEvent carrying it is exactly what the window listeners see.
const pointer = (type: string, clientX = 0) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100 });
const down = (el: Element | null, clientX = 0) => fireEvent(el!, pointer("pointerdown", clientX));
const moveTo = (clientX: number) => fireEvent(window, pointer("pointermove", clientX));
const up = () => fireEvent(window, pointer("pointerup"));
// dispatched on the body so the handler's target guard sees an element, as it does in a browser
const press = (key: string) => fireEvent.keyDown(document.body, { key });

describe("the blend window a transition owns", () => {
  it("runs from the cut, because that is where the engine starts revealing the clip", () => {
    const b = clip("video", 4, 4, "b");
    expect(transitionInSpan(b)).toBeNull();
    const withFade = { ...b, transitionIn: { type: "fade", duration: 0.8 } };
    expect(transitionInSpan(withFade)).toEqual({ start: 4, duration: 0.8 });
  });
  it("never runs past the clip it is revealing", () => {
    const short = { ...clip("video", 4, 1, "b"), transitionIn: { type: "fade", duration: 6 } };
    expect(transitionInSpan(short)!.duration).toBe(1);
  });
  it("is not drawn for clips that paint no frame layer", () => {
    const audio = { ...clip("audio", 4, 4, "a"), transitionIn: { type: "fade", duration: 0.5 } };
    expect(transitionInSpan(audio)).toBeNull();
  });
});

describe("a transition is its own block instead of a piece of the second clip", () => {
  it("sits inline on the lane over the cut, never inside a clip rectangle", () => {
    const { container } = render(<TimelineUI store={joined()} assets={new Map()} />);
    const block = container.querySelector('[data-transition-for="b"]')!;
    // the blend shares the lane that holds the two clips (like the marketing mock) - not a band below
    expect(block.closest("[data-track-id]")).toBeTruthy();
    expect(container.querySelector("[data-transition-strip]")).toBeNull();
    expect(block.closest("[data-clip-id]")).toBeNull();
  });

  it("straddles the cut evenly and is as wide as the blend it performs", () => {
    const { container } = render(<TimelineUI store={joined()} assets={new Map()} />);
    const trans = box(container.querySelector('[data-transition-for="b"]'));
    const body = box(container.querySelector('[data-clip-id="b"]'));
    const prev = box(container.querySelector('[data-clip-id="a"]'));
    expect(trans.width).toBeCloseTo(0.8 * PPS, 4);
    // half of it under each video, so it belongs to neither
    expect(trans.left).toBeCloseTo(4 * PPS - (0.8 * PPS) / 2, 4);
    expect(trans.left + trans.width / 2).toBeCloseTo(4 * PPS, 4);
    // clips are display-shortened to give the block its own gap
    expect(prev.left).toBeCloseTo(0, 4);
    expect(prev.width).toBeCloseTo(3.6 * PPS, 4);
    expect(body.left).toBeCloseTo(4.4 * PPS, 4);
    expect(body.width).toBeCloseTo(3.6 * PPS, 4);
    // no overlap: A ends exactly where transition begins, transition ends where B begins
    expect(prev.right).toBeCloseTo(trans.left, 4);
    expect(trans.right).toBeCloseTo(body.left, 4);
  });

  it("is painted as its own object, not in the colours of the two clips", () => {
    const { container } = render(<TimelineUI store={joined()} assets={new Map()} />);
    const block = container.querySelector('[data-transition-for="b"]')!;
    expect(block.className).toContain("bg-card");
    expect(block.querySelector('[class*="bg-clip-"]')).toBeNull();
  });

  it("still appears when the clip has nothing touching in front of it", () => {
    const a = clip("video", 0, 4, "a");
    const b = { ...clip("video", 6, 4, "b"), transitionIn: { type: "zoom-in", duration: 0.6 } };
    const store = new EditorStore(tl([lane("video", [a, b])]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const trans = box(container.querySelector('[data-transition-for="b"]'));
    expect(trans.width).toBeCloseTo(0.6 * PPS, 4);
    expect(trans.left + trans.width / 2).toBeCloseTo(6 * PPS, 4);
  });

  it("stays grabbable at tight zoom without losing the transition's data width", () => {
    const store = joined(0.05);
    store.set({ pxPerSec: 8 });
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const trans = box(container.querySelector('[data-transition-for="b"]'));
    const body = box(container.querySelector('[data-clip-id="b"]'));
    expect(trans.width).toBeGreaterThanOrEqual(20);
    expect(trans.left + trans.width / 2).toBeCloseTo(4 * 8, 4);
    // display shortened by half the tiny blend (0.025s) but data stays 4s
    expect(body.width).toBeCloseTo((4 - 0.025) * 8, 4);
    expect(clipDuration(store.get().timeline.tracks[0]!.clips[1]!)).toBe(4);
  });

  it("trims its starting edge alone, holding the far edge still", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const before = box(container.querySelector('[data-transition-for="b"]'));
    const handle = container.querySelector('[data-transition-edge="l"]')!;
    down(handle, 216);
    moveTo(186); // pull the cut-side edge out half a second; only that edge moves
    up();
    const after = box(container.querySelector('[data-transition-for="b"]'));
    expect(seamOf(store)!.duration).toBeCloseTo(1.3, 5);
    expect(after.right).toBeCloseTo(before.right, 4); // far edge did not move
    expect(after.left).toBeLessThan(before.left); // start edge grew toward the previous clip
    // clip A's display shortened further to accommodate the grown transition
    expect(box(container.querySelector('[data-clip-id="a"]')).width).toBeCloseTo(3.1 * PPS, 4);
  });

  it("trims its ending edge alone, holding the cut still", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const before = box(container.querySelector('[data-transition-for="b"]'));
    const handle = container.querySelector('[data-transition-edge="r"]')!;
    down(handle, 264);
    moveTo(294); // push the far edge out half a second; the cut-side edge stays put
    up();
    const after = box(container.querySelector('[data-transition-for="b"]'));
    expect(seamOf(store)!.duration).toBeCloseTo(1.3, 5);
    expect(after.left).toBeCloseTo(before.left, 4); // cut side did not move
    expect(after.right).toBeGreaterThan(before.right); // far edge grew
    expect(store.get().timeline.tracks[0]!.clips.every((c) => clipDuration(c) === 4)).toBe(true);
  });

  it("resizing it leaves both clips' data and the whole timeline the same length", () => {
    const store = joined();
    const before = timelineDuration(store.get().timeline);
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    down(container.querySelector('[data-transition-edge="r"]')!, 264);
    moveTo(264 + 2 * PPS); // reach the blend 2s further into the clip
    up();
    expect(seamOf(store)!.duration).toBeCloseTo(2.8, 5);
    // clip data unchanged: positions and durations stay the same
    expect(timelineDuration(store.get().timeline)).toBeCloseTo(before, 5);
    expect(store.get().timeline.tracks[0]!.clips.every((c) => clipDuration(c) === 4)).toBe(true);
    // clip display shortened for B (its left edge moved) but A stays the same
    const body = box(container.querySelector('[data-clip-id="b"]'));
    expect(body.left).toBeCloseTo(6.4 * PPS, 4);
    expect(body.width).toBeCloseTo(1.6 * PPS, 4);
  });
});

describe("a transition can be selected, stretched and deleted", () => {
  it("clicking the block selects the transition itself and shows its blend", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    down(container.querySelector('[data-transition-for="b"]'));
    expect(store.get().selectedTransitionOf).toBe("b");
    expect(store.get().inspectorTab).toBe("trans");
    expect(store.get().playing).toBe(false);
    // parked inside the blend window, so the frame being edited is the one on screen
    expect(store.get().time).toBeGreaterThan(4);
    expect(store.get().time).toBeLessThan(4.8);
    up();
  });

  it("Delete on a selected transition removes the blend and keeps both clips", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    down(container.querySelector('[data-transition-for="b"]'));
    up();
    press("Delete");
    expect(store.get().timeline.tracks[0]!.clips.map((c) => c.id)).toEqual(["a", "b"]);
    expect(seamOf(store)).toBeUndefined();
    expect(store.get().selectedTransitionOf).toBeNull();
  });

  it("the cross on a selected block does the same thing", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    down(container.querySelector('[data-transition-for="b"]'));
    fireEvent.click(container.querySelector('[aria-label="Remove transition"]')!);
    expect(seamOf(store)).toBeUndefined();
    expect(store.get().timeline.tracks[0]!.clips).toHaveLength(2);
    up();
  });

  it("clicking the clip instead hands Delete back to the clip", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    down(container.querySelector('[data-transition-for="b"]'));
    up();
    down(container.querySelector('[data-clip-id="b"]'));
    up();
    expect(store.get().selectedTransitionOf).toBeNull();
    press("Delete");
    expect(store.get().timeline.tracks[0]!.clips.map((c) => c.id)).toEqual(["a"]);
  });

  it("dragging the far edge stretches the blend, and pulling it back squeezes it", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const handle = container.querySelector('[data-transition-edge="r"]')!;
    down(handle, 264);
    moveTo(264 + PPS); // one second more
    expect(seamOf(store)!.duration).toBeCloseTo(1.8, 5);
    moveTo(264 + 0.5 * PPS); // and pulled back again
    expect(seamOf(store)!.duration).toBeCloseTo(1.3, 5);
    up();
  });

  it("stops where the blend can reach into the clip", () => {
    const store = joined();
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const handle = container.querySelector('[data-transition-edge="r"]')!;
    down(handle, 264);
    moveTo(264 + 1000); // as far as it will go
    expect(seamOf(store)!.duration).toBe(
      maxTransitionDuration(clip("video", 0, 4), clip("video", 4, 4)),
    );
    moveTo(264 - 1000); // and no shorter than a sliver
    expect(seamOf(store)!.duration).toBe(0.1);
    up();
  });

  it("nothing appears on the lane until a transition is explicitly added", () => {
    const store = new EditorStore(
      tl([lane("video", [clip("video", 0, 4, "a"), clip("video", 4, 4, "b")])]),
    );
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    // no seam button, no transition block — just the two clips
    expect(container.querySelector('[aria-label="Add transition"]')).toBeNull();
    expect(container.querySelector('[data-transition-for="b"]')).toBeNull();
  });

  it("a locked lane refuses to change the blend", () => {
    const tr = lane("video", [
      clip("video", 0, 4, "a"),
      { ...clip("video", 4, 4, "b"), transitionIn: { type: "fade", duration: 0.8 } },
    ]);
    tr.locked = true;
    const store = new EditorStore(tl([tr]));
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    down(container.querySelector('[data-transition-for="b"]'), 300);
    moveTo(420);
    up();
    expect(seamOf(store)!.duration).toBe(0.8);
  });
});
