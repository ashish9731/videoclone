import { describe, it, expect } from "vitest";
import { EditorStore } from "../lib/editor/store";
import { addClipToTimeline } from "../lib/editor/placement";
import {
  clipFromAsset,
  defaultTimeline,
  defaultWatermark,
  type MediaAsset,
} from "../lib/editor/types";

const asset: MediaAsset = {
  id: "a1",
  storage_path: "u/a1.mp4",
  name: "clip",
  kind: "video",
  mime: "video/mp4",
  size_bytes: 10,
  duration: 5,
  width: 100,
  height: 100,
  project_id: "p",
};

function storeWithWatermark() {
  // the watermark is a project setting held on the store, not inside the undoable timeline
  const store = new EditorStore(defaultTimeline());
  store.setWatermark({ ...defaultWatermark(), enabled: true, text: "WM" });
  return store;
}

describe("watermark survives timeline edits", () => {
  it("is kept through a transform that rebuilds only { tracks }", () => {
    const store = storeWithWatermark();
    store.update((t) => ({ tracks: t.tracks.map((tr) => ({ ...tr, muted: true })) }));
    expect(store.get().watermark.text).toBe("WM");
    expect(store.get().watermark.enabled).toBe(true);
    expect(store.get().timeline.tracks.every((tr) => tr.muted)).toBe(true);
  });

  it("is kept when a clip is added to the timeline", () => {
    const store = storeWithWatermark();
    addClipToTimeline(store, clipFromAsset(asset, 0));
    expect(store.get().watermark.enabled).toBe(true);
    expect(store.get().timeline.tracks.some((tr) => tr.clips.length > 0)).toBe(true);
  });

  it("is kept when the last edit is undone", () => {
    const store = storeWithWatermark();
    addClipToTimeline(store, clipFromAsset(asset, 0));
    store.undo();
    expect(store.get().watermark.text).toBe("WM");
    expect(store.get().timeline.tracks.every((tr) => tr.clips.length === 0)).toBe(true);
  });

  it("is picked up from a saved timeline JSON on load", () => {
    const timeline = defaultTimeline();
    timeline.watermark = { ...defaultWatermark(), enabled: true, text: "Restored" };
    expect(new EditorStore(timeline).get().watermark.text).toBe("Restored");
  });

  it("stays off only when the user turns it off, never because of an edit", () => {
    const store = storeWithWatermark();
    store.setWatermark({ ...store.get().watermark, enabled: false });
    store.update((t) => ({ tracks: t.tracks.map((tr) => ({ ...tr, locked: true })) }));
    expect(store.get().watermark.enabled).toBe(false);
  });
});
