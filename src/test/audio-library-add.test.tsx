import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SOUNDS } from "@/lib/editor/sfx";
import { EditorStore } from "@/lib/editor/store";
import { defaultTimeline } from "@/lib/editor/types";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/editor/media", () => ({
  uploadMedia: vi.fn(async () => ({
    id: "asset-flute",
    storage_path: "u1/uuid.mp3",
    name: "Krishna Flute.mp3",
    kind: "audio",
    mime: "audio/mpeg",
    size_bytes: 4406961,
    duration: 137.72,
    width: null,
    height: null,
    project_id: "p1",
  })),
}));

import { uploadMedia } from "@/lib/editor/media";
import type { MediaAsset } from "@/lib/editor/types";
import { AudioLibrary } from "@/components/editor/AudioLibrary";

// the two bundled recordings the user supplied; the flute is what we add here
const flute = SOUNDS.find((s) => s.url === "/audio/devotional/krishna-flute.mp3")!;

describe("Audio library: a real recording adds to the timeline through Supabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // serve the bundled file to both the add path (blob) and waveform decode (arrayBuffer)
    global.fetch = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["mp3-bytes"], { type: "audio/mpeg" }),
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
  });

  it("uploads the original mp3 (not a re-encode) and places a clip of its true length", async () => {
    const store = new EditorStore(defaultTimeline());
    const onAdded = vi.fn();
    render(<AudioLibrary store={store} userId="u1" projectId="p1" onAdded={onAdded} />);

    // narrow the gallery to the one sound so we target its Add button
    fireEvent.change(screen.getByLabelText("Search audio"), { target: { value: flute.name } });
    fireEvent.click(await screen.findByRole("button", { name: `Add ${flute.name}` }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));

    // + Add routed the real file to Supabase storage as its own mp3...
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    const [file] = vi.mocked(uploadMedia).mock.calls[0] as [File, string, string, (p: number) => void];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe(`${flute.name}.mp3`);
    expect(file.type).toBe("audio/mpeg");
    // ...and the returned asset became an audio clip sized to the recording, on the timeline
    const placed = onAdded.mock.calls[0]?.[0] as MediaAsset | undefined;
    expect(placed).toMatchObject({ id: "asset-flute", kind: "audio" });
    const added = store.get().timeline.tracks.flatMap((t) => t.clips).find((c) => c.assetId === "asset-flute");
    expect(added, "clip placed on timeline").toBeTruthy();
    expect(added!.kind).toBe("audio");
    expect(added!.out).toBeCloseTo(placed!.duration, 2);
  });
});
