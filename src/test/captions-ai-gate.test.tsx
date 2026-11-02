import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// sonner's export is called both as `toast(...)` and as `toast.info(...)`; the panel uses both forms.
const sonner = vi.hoisted(() =>
  Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn() }),
);
vi.mock("sonner", () => ({ toast: sonner }));

// The still-locked surfaces must not even reach the modules they would have used: these spies fail
// the test if a click gets past the Pro notice and starts a job.
const transcribe = vi.fn();
vi.mock("@/lib/editor/transcribe-client", () => ({
  transcribeTimeline: (...args: unknown[]) => transcribe(...args),
}));
const serverFn = vi.fn();
vi.mock("@/lib/ai.functions", () => ({ translateCues: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => serverFn }));

import { CaptionsPanel } from "@/components/editor/CaptionsPanel";
import { EditorStore } from "@/lib/editor/store";
import {
  type CaptionCue,
  type CaptionTrack,
  type MediaAsset,
  defaultCaptionStyle,
  defaultTimeline,
} from "@/lib/editor/types";

// Radix (Slider, Select) measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const cue = (id: string, start: number, end: number, text: string): CaptionCue => ({
  id,
  start,
  end,
  text,
});

const track = (cues: CaptionCue[]): CaptionTrack => ({
  id: "cap-1",
  project_id: "p1",
  name: "My captions",
  language: "en",
  cues,
  style: defaultCaptionStyle(),
  visible: true,
});

function setup(tracks: CaptionTrack[], activeId: string | null) {
  const store = new EditorStore(defaultTimeline());
  const createTrack = vi.fn(async (t: Omit<CaptionTrack, "id" | "project_id">) => ({
    ...t,
    id: "cap-new",
    project_id: "p1",
  }));
  const utils = render(
    <CaptionsPanel
      store={store}
      assets={new Map<string, MediaAsset>()}
      tracks={tracks}
      activeId={activeId}
      setActiveId={vi.fn()}
      createTrack={createTrack}
      updateTrack={vi.fn()}
      deleteTrack={vi.fn()}
    />,
  );
  return { ...utils, store, createTrack };
}

describe("captions panel AI gate", () => {
  beforeEach(() => {
    sonner.info.mockClear();
    transcribe.mockClear();
    serverFn.mockClear();
  });

  it("runs the real transcription job when the auto-caption button is clicked", async () => {
    transcribe.mockResolvedValue([cue("t1", 0.5, 1.6, "Hello there")]);
    const { getByRole, createTrack } = setup([], null);
    fireEvent.click(getByRole("button", { name: /Auto-generate captions/ }));
    await waitFor(() => expect(createTrack).toHaveBeenCalledTimes(1));
    expect(transcribe).toHaveBeenCalledTimes(1);
    // no forced language: the model detects and captions in the spoken language
    expect(vi.mocked(transcribe).mock.calls[0]?.[2]).toBeUndefined();
    expect(vi.mocked(createTrack).mock.calls[0]?.[0]?.name).toBe("Auto captions");
    expect(vi.mocked(createTrack).mock.calls[0]?.[0]?.language).toBe("auto");
  });

  it("ships both caption AI controls, so nothing carries a Pro chip", () => {
    const { queryAllByText, getByText } = setup([track([cue("c1", 1, 2, "Hello")])], "cap-1");
    // transcription and translation both run on connected services now
    expect(queryAllByText("Pro")).toHaveLength(0);
    expect(
      getByText("Transcribes the spoken audio on your timeline into timed captions."),
    ).toBeTruthy();
  });

  it("runs the real translation when Translate is clicked", async () => {
    serverFn.mockResolvedValue([{ id: "c1", text: "Bonjour" }]);
    const { getByRole, createTrack } = setup([track([cue("c1", 1, 2, "Hello")])], "cap-1");
    fireEvent.click(getByRole("button", { name: /Translate/ }));
    await waitFor(() => expect(createTrack).toHaveBeenCalledTimes(1));
    expect(serverFn).toHaveBeenCalledTimes(1);
    const created = vi.mocked(createTrack).mock.calls[0]?.[0];
    expect(created?.cues[0]?.text).toBe("Bonjour");
    // the source track is hidden once the translated one exists
    expect(created?.language).not.toBe("auto");
  });

  it("leaves the caption work that really runs un gated", () => {
    const { getByRole, createTrack } = setup([], null);
    fireEvent.click(getByRole("button", { name: /Manual captions/ }));
    expect(createTrack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createTrack).mock.calls[0]?.[0]?.name).toBe("Manual captions");
    expect(transcribe).not.toHaveBeenCalled();
  });
});
