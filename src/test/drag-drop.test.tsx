import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorStore } from "@/lib/editor/store";
import { type MediaAsset, defaultTimeline } from "@/lib/editor/types";
import { ASSET_MIME, Timeline } from "@/components/editor/Timeline";
import { MediaPanel } from "@/components/editor/MediaPanel";

// Radix (Slider, DropdownMenu) measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const asset: MediaAsset = {
  id: "asset-1",
  storage_path: "u1/clip.mp4",
  name: "clip.mp4",
  kind: "video",
  mime: "video/mp4",
  size_bytes: 1024,
  duration: 8,
  width: 1920,
  height: 1080,
  project_id: "p1",
};

function makeDataTransfer(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    types: Object.keys(data),
    getData: (t: string) => data[t] ?? "",
    setData: vi.fn((t: string, v: string) => {
      data[t] = v;
    }),
    files: [] as File[],
    items: [] as string[],
    effectAllowed: "none",
    dropEffect: "none",
  };
}

// jsdom has no DragEvent constructor, so build a MouseEvent and attach the
// fake dataTransfer the way a real browser would expose it on drop events.
function fireDrag(node: Element, type: string, dt: unknown, clientX: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100 });
  Object.defineProperty(ev, "dataTransfer", { value: dt });
  return !node.dispatchEvent(ev); // true when preventDefault was called
}

// jsdom lacks PointerEvent, and the testing-library fallback loses clientX on
// window, so dispatch plain MouseEvents with the pointer event names.
function pointer(target: Window | Element, type: string, clientX: number) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 100 }));
}

describe("media drag and drop onto timeline", () => {
  it("media panel items are draggable and put the asset id on the dataTransfer", () => {
    const store = new EditorStore(defaultTimeline());
    const { container } = render(
      <MediaPanel store={store} assets={[asset]} userId="u1" projectId="p1" onAdded={vi.fn()} onRemoved={vi.fn()} />,
    );
    const item = container.querySelector(`[draggable="true"]`);
    expect(item).not.toBeNull();
    const dt = makeDataTransfer();
    fireEvent.dragStart(item!, { dataTransfer: dt });
    expect(dt.setData).toHaveBeenCalledWith(ASSET_MIME, asset.id);
    // Engines that ignore custom MIME payloads still see a standard format.
    expect(dt.setData).toHaveBeenCalledWith("text/plain", asset.id);
  });

  it("video track lane accepts the asset drag over it", () => {
    const store = new EditorStore(defaultTimeline());
    const videoTrack = store.get().timeline.tracks.find((t) => t.kind === "video")!;
    const { container } = render(<Timeline store={store} assets={new Map([[asset.id, asset]])} />);
    const lane = container.querySelector(`[data-track-id="${videoTrack.id}"]`)!;
    const dt = makeDataTransfer({ [ASSET_MIME]: asset.id });
    // dragOver must preventDefault so the browser allows the drop
    expect(fireDrag(lane, "dragover", dt, 328)).toBe(true);
  });

  it("dropping the asset on a video track adds a clip at the drop position", () => {
    const store = new EditorStore(defaultTimeline());
    const videoTrack = store.get().timeline.tracks.find((t) => t.kind === "video")!;
    const { container } = render(<Timeline store={store} assets={new Map([[asset.id, asset]])} />);
    const lane = container.querySelector(`[data-track-id="${videoTrack.id}"]`)!;
    const dt = makeDataTransfer({ [ASSET_MIME]: asset.id });
    fireDrag(lane, "drop", dt, 328);
    const clips = store.get().timeline.tracks.find((t) => t.id === videoTrack.id)!.clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]!.assetId).toBe(asset.id);
    expect(Number.isFinite(clips[0]!.start)).toBe(true);
    expect(clips[0]!.start).toBeGreaterThan(0);
  });

  it("dragging over an incompatible kind still prevents default so the drop can land elsewhere", () => {
    // Audio asset dropped on the text track: the text lane rejects the MIME in
    // dragOver? It should accept it and route the clip to a compatible track.
    const store = new EditorStore(defaultTimeline());
    const textTrack = store.get().timeline.tracks.find((t) => t.kind === "text")!;
    const audio: MediaAsset = { ...asset, id: "audio-1", kind: "audio", mime: "audio/wav", name: "a.wav" };
    const { container } = render(<Timeline store={store} assets={new Map([[audio.id, audio]])} />);
    const lane = container.querySelector(`[data-track-id="${textTrack.id}"]`)!;
    const dt = makeDataTransfer({ [ASSET_MIME]: audio.id });
    fireDrag(lane, "drop", dt, 328);
    const audioTrack = store.get().timeline.tracks.find((t) => t.kind === "audio")!;
    expect(audioTrack.clips.some((c) => c.assetId === audio.id)).toBe(true);
  });

  it("Safari-style drag whose types list lost the custom MIME still lands via the active-drag flag", () => {
    const store = new EditorStore(defaultTimeline());
    const videoTrack = store.get().timeline.tracks.find((t) => t.kind === "video")!;
    const { container } = render(
      <div>
        <MediaPanel store={store} assets={[asset]} userId="u1" projectId="p1" onAdded={vi.fn()} onRemoved={vi.fn()} />
        <Timeline store={store} assets={new Map([[asset.id, asset]])} />
      </div>,
    );
    const item = container.querySelector(`[draggable="true"]`)!;
    const dt = makeDataTransfer();
    fireEvent.dragStart(item, { dataTransfer: dt }); // begins the internal-drag flag
    const lane = container.querySelector(`[data-track-id="${videoTrack.id}"]`)!;
    // Simulate an engine that only propagates the standard format in types.
    const stripped = { ...dt, types: ["text/plain"] };
    expect(fireDrag(lane, "dragover", stripped, 328)).toBe(true);
    fireDrag(lane, "drop", stripped, 328);
    fireEvent.dragEnd(item);
    const clips = store.get().timeline.tracks.find((t) => t.id === videoTrack.id)!.clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]!.assetId).toBe(asset.id);
    expect(clips[0]!.start).toBeGreaterThan(0);
  });

  it("dropping outside any lane still lands on the first compatible track at the free position", () => {
    const store = new EditorStore(defaultTimeline());
    const { container } = render(<Timeline store={store} assets={new Map([[asset.id, asset]])} />);
    // The scroll wrapper covers ruler, lanes and the empty space below tracks.
    const area = container.querySelector(".overflow-auto")!;
    const dt = makeDataTransfer({ [ASSET_MIME]: asset.id });
    fireDrag(area, "drop", dt, 528);
    const videoTrack = store.get().timeline.tracks.find((t) => t.kind === "video")!;
    expect(videoTrack.clips).toHaveLength(1);
    // (528 - 168 header) / 60 pxPerSec = 6s, not a fixed slot.
    expect(videoTrack.clips[0]!.start).toBeCloseTo(6, 5);
  });

  it("the dropped clip can be trimmed from its right edge", async () => {
    const store = new EditorStore(defaultTimeline());
    const videoTrack = store.get().timeline.tracks.find((t) => t.kind === "video")!;
    const { container } = render(<Timeline store={store} assets={new Map([[asset.id, asset]])} />);
    const lane = container.querySelector(`[data-track-id="${videoTrack.id}"]`)!;
    fireDrag(lane, "drop", makeDataTransfer({ [ASSET_MIME]: asset.id }), 328);
    const clip = store.get().timeline.tracks.find((t) => t.id === videoTrack.id)!.clips[0]!;
    expect(clip.out).toBe(8);

    const handle = await waitFor(() => {
      const el = container.querySelector(`[data-clip-id="${clip.id}"] [data-trim-edge="r"]`);
      if (!el) throw new Error("trim handle not rendered");
      return el;
    });
    // testing-library's PointerEvent fallback loses clientX, so use raw events.
    pointer(handle, "pointerdown", 328);
    pointer(window, "pointermove", 268); // 1s earlier at 60 pxPerSec
    pointer(window, "pointerup", 268);

    const trimmed = store.findClip(clip.id)!.clip;
    expect(trimmed.out).toBeCloseTo(7, 4);
    expect(trimmed.start).toBeCloseTo(clip.start, 5); // only the tail moved
  });

  it("the dropped clip can be trimmed from its left edge", async () => {
    const store = new EditorStore(defaultTimeline());
    const videoTrack = store.get().timeline.tracks.find((t) => t.kind === "video")!;
    const { container } = render(<Timeline store={store} assets={new Map([[asset.id, asset]])} />);
    const lane = container.querySelector(`[data-track-id="${videoTrack.id}"]`)!;
    fireDrag(lane, "drop", makeDataTransfer({ [ASSET_MIME]: asset.id }), 328);
    const clip = store.get().timeline.tracks.find((t) => t.id === videoTrack.id)!.clips[0]!;

    const handle = await waitFor(() => {
      const el = container.querySelector(`[data-clip-id="${clip.id}"] [data-trim-edge="l"]`);
      if (!el) throw new Error("trim handle not rendered");
      return el;
    });
    pointer(handle, "pointerdown", 328);
    pointer(window, "pointermove", 388); // 1s later at 60 pxPerSec
    pointer(window, "pointerup", 388);

    const trimmed = store.findClip(clip.id)!.clip;
    expect(trimmed.in).toBeCloseTo(1, 4); // one source second skipped
    expect(trimmed.start).toBeCloseTo(clip.start + 1, 4);
  });
});
