import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorStore } from "@/lib/editor/store";
import {
  clipEnd,
  effectClip,
  filterClip,
  type Clip,
  type Timeline,
  type Track,
  defaultEffects,
  defaultTransform,
} from "@/lib/editor/types";
import { Timeline as TimelineUI } from "@/components/editor/Timeline";

// Radix measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const HEADER_W = 168;
const PPS = 60;
// the lane holds no scroll in jsdom, so timeline seconds map straight to client X
const xAt = (t: number) => HEADER_W + t * PPS;

// jsdom has no PointerEvent; dispatch plain MouseEvents under the pointer names.
function pointer(target: Window | Element, type: string, clientX: number) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100 }),
  );
}

function video(start: number, dur: number, patch: Partial<Clip> = {}): Clip {
  return {
    id: `v${start}`,
    kind: "video",
    name: "v",
    start,
    in: 0,
    out: dur,
    sourceDuration: dur,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    effects: defaultEffects(),
    transform: defaultTransform(),
    keyframes: {},
    ...patch,
  };
}

const track = (kind: Track["kind"], clips: Clip[]): Track => ({
  id: `tr-${kind}`,
  kind,
  name: kind,
  muted: false,
  hidden: false,
  locked: false,
  clips,
});

function seed(timeline: Timeline) {
  const store = new EditorStore(timeline);
  store.set({ snapping: false, pxPerSec: PPS });
  return store;
}

describe("uniform blocks trim from both ends", () => {
  it("an effect block extends its left edge backwards, holding the end fixed", async () => {
    const ec = effectClip("glow", "Glow", 5, 4); // window [5, 9]
    const store = seed({ tracks: [track("effect", [ec])] });
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);

    const handle = await waitFor(() => {
      const el = container.querySelector(`[data-clip-id="${ec.id}"] [data-trim-edge="l"]`);
      if (!el) throw new Error("left trim handle not rendered");
      return el;
    });
    // grab the current left edge (t=5) and pull it one second earlier (t=4)
    pointer(handle, "pointerdown", xAt(5));
    pointer(window, "pointermove", xAt(4));
    pointer(window, "pointerup", xAt(4));

    const trimmed = store.findClip(ec.id)!.clip;
    expect(trimmed.start).toBeCloseTo(4, 4);
    expect(clipEnd(trimmed)).toBeCloseTo(9, 4); // end did not move
    expect(trimmed.in).toBe(0);
  });

  it("a filter block grows from the right edge", async () => {
    const fc = filterClip("noir", "Noir", 2, 3); // window [2, 5]
    const store = seed({ tracks: [track("filter", [fc])] });
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);

    const handle = await waitFor(() => {
      const el = container.querySelector(`[data-clip-id="${fc.id}"] [data-trim-edge="r"]`);
      if (!el) throw new Error("right trim handle not rendered");
      return el;
    });
    pointer(handle, "pointerdown", xAt(5));
    pointer(window, "pointermove", xAt(7)); // two seconds longer
    pointer(window, "pointerup", xAt(7));

    const trimmed = store.findClip(fc.id)!.clip;
    expect(trimmed.start).toBeCloseTo(2, 4);
    expect(clipEnd(trimmed)).toBeCloseTo(7, 4);
  });
});

describe("transition block trims from both ends", () => {
  const joinTimeline = () => {
    const b = video(4, 4, { transitionIn: { type: "fade", duration: 1 } });
    return { tracks: [track("video", [video(0, 4), b])] };
  };

  const edge = (container: HTMLElement, side: "l" | "r", clipId: string) =>
    container.querySelector(`[data-transition-for="${clipId}"] [data-transition-edge="${side}"]`);

  it("the left edge lengthens the blend", async () => {
    const store = seed(joinTimeline());
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const handle = await waitFor(() => {
      const el = edge(container, "l", "v4");
      if (!el) throw new Error("left transition edge not rendered");
      return el;
    });
    // the blend is centred on the cut at t=4; pull the left handle one second earlier
    pointer(handle, "pointerdown", xAt(3.5));
    pointer(window, "pointermove", xAt(2.5));
    pointer(window, "pointerup", xAt(2.5));

    const dur = store.findClip("v4")!.clip.transitionIn?.duration ?? 0;
    expect(dur).toBeGreaterThan(1.5); // ~3s, well past the 1s it started at
  });

  it("the right edge lengthens the blend", async () => {
    const store = seed(joinTimeline());
    const { container } = render(<TimelineUI store={store} assets={new Map()} />);
    const handle = await waitFor(() => {
      const el = edge(container, "r", "v4");
      if (!el) throw new Error("right transition edge not rendered");
      return el;
    });
    pointer(handle, "pointerdown", xAt(4.5));
    pointer(window, "pointermove", xAt(5.5));
    pointer(window, "pointerup", xAt(5.5));

    const dur = store.findClip("v4")!.clip.transitionIn?.duration ?? 0;
    expect(dur).toBeGreaterThan(1.5);
  });
});
