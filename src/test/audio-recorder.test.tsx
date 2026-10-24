import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EditorStore } from "@/lib/editor/store";
import { defaultTimeline } from "@/lib/editor/types";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/editor/media", () => ({
  uploadMedia: vi.fn(async () => ({
    id: "rec-asset",
    storage_path: "u1/x.wav",
    name: "x.wav",
    kind: "audio",
    mime: "audio/wav",
    size_bytes: 8,
    duration: 5,
    width: null,
    height: null,
    project_id: "p1",
  })),
}));
vi.mock("@/lib/editor/recorder", () => ({
  openStream: vi.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] })),
  startRecorder: vi.fn(() => ({ stop: vi.fn(async () => new Blob(["opus"])), cancel: vi.fn() })),
  chooseRecorderMime: vi.fn(() => "audio/webm;codecs=opus"),
  blobToWavFile: vi.fn(async (_b: Blob, name: string) => ({ file: new File(["wav"], `${name}.wav`, { type: "audio/wav" }), duration: 5 })),
  permissionMessage: vi.fn(() => "record error"),
}));

import { openStream, blobToWavFile } from "@/lib/editor/recorder";
import { uploadMedia } from "@/lib/editor/media";
import { AudioRecorder } from "@/components/editor/AudioRecorder";

describe("AudioRecorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:rec");
    URL.revokeObjectURL = vi.fn();
  });

  it("asks the source before recording, then records, reviews and adds to the timeline", async () => {
    const store = new EditorStore(defaultTimeline());
    const onAdded = vi.fn();
    render(<AudioRecorder store={store} userId="u1" projectId="p1" onAdded={onAdded} />);

    // 1. the feature first asks: external (Microphone) or Browser
    fireEvent.click(screen.getByRole("button", { name: /Record audio/i }));
    expect(await screen.findByRole("button", { name: /Microphone/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Browser/i })).toBeTruthy();

    // 2. choosing Microphone opens that stream and starts capture
    fireEvent.click(screen.getByRole("button", { name: /Microphone/i }));
    const stop = await screen.findByRole("button", { name: /Stop/i });
    await waitFor(() => expect(openStream).toHaveBeenCalledWith("microphone"));

    // 3. stopping encodes a lossless WAV and shows review actions
    fireEvent.click(stop);
    await waitFor(() => expect(blobToWavFile).toHaveBeenCalled());
    const add = await screen.findByRole("button", { name: /Add to timeline/i });
    expect(screen.getByRole("button", { name: /Save to library/i })).toBeTruthy();

    // 4. Add uploads to the media bucket (Supabase), surfaces it in the project, and places a clip
    fireEvent.click(add);
    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(1));
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-asset", kind: "audio" }));
    const placed = store.get().timeline.tracks.flatMap((t) => t.clips).find((c) => c.assetId === "rec-asset");
    expect(placed, "recording clip on timeline").toBeTruthy();
    expect(placed!.kind).toBe("audio");
    expect(placed!.out).toBeCloseTo(5, 2);
  });

  it("save-to-library persists without touching the timeline", async () => {
    const store = new EditorStore(defaultTimeline());
    const onAdded = vi.fn();
    render(<AudioRecorder store={store} userId="u1" projectId="p1" onAdded={onAdded} />);
    fireEvent.click(screen.getByRole("button", { name: /Record audio/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Browser/i }));
    await waitFor(() => expect(openStream).toHaveBeenCalledWith("browser"));
    fireEvent.click(await screen.findByRole("button", { name: /Stop/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Save to library/i }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(store.get().timeline.tracks.flatMap((t) => t.clips)).toHaveLength(0);
  });
});
