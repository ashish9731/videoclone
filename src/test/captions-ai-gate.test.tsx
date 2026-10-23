import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// sonner's export is called both as `toast(...)` and as `toast.info(...)`; the panel uses both forms.
const sonner = vi.hoisted(() =>
  Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), success: vi.fn() }),
);
vi.mock("sonner", () => ({ toast: sonner }));

// The gated actions must not even reach the modules they would have used: these spies fail the test
// if a click gets past the Pro notice and starts a job.
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
import { PRO_COPY } from "@/lib/pro-gate";

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

  it("answers the auto-caption button with the Pro notice instead of transcribing", () => {
    const { getByRole } = setup([], null);
    fireEvent.click(getByRole("button", { name: /Auto-generate captions/ }));
    expect(sonner.info).toHaveBeenCalledWith(PRO_COPY.autoCaptions.title, {
      description: PRO_COPY.autoCaptions.body,
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("says up front which caption controls are Pro-only", () => {
    const { getAllByText, getByText } = setup([track([cue("c1", 1, 2, "Hello")])], "cap-1");
    // one chip on the transcription button, one on Translate
    expect(getAllByText("Pro")).toHaveLength(2);
    // and the line under the button is the gate's own sentence, not a second copy of it
    expect(getByText(PRO_COPY.autoCaptions.title)).toBeTruthy();
  });

  it("answers the translate button with the Pro notice instead of calling the server", () => {
    const { getByRole } = setup([track([cue("c1", 1, 2, "Hello")])], "cap-1");
    fireEvent.click(getByRole("button", { name: /Translate/ }));
    expect(sonner.info).toHaveBeenCalledWith(PRO_COPY.captionTranslate.title, {
      description: PRO_COPY.captionTranslate.body,
    });
    expect(serverFn).not.toHaveBeenCalled();
  });

  it("leaves the caption work that really runs un gated", () => {
    const { getByRole, createTrack } = setup([], null);
    fireEvent.click(getByRole("button", { name: /Manual captions/ }));
    expect(createTrack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createTrack).mock.calls[0]?.[0]?.name).toBe("Manual captions");
    expect(transcribe).not.toHaveBeenCalled();
  });
});
