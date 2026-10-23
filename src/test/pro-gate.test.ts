import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { toast } from "sonner";

import { applyPresetAt } from "@/components/editor/library-drag";
import { EFFECTS } from "@/lib/editor/fx";
import { EditorStore } from "@/lib/editor/store";
import { defaultTimeline } from "@/lib/editor/types";
import {
  PRO_AVAILABLE,
  PRO_COPY,
  announcePro,
  isProEffect,
  isProPreset,
  proLocked,
  type ProFeature,
} from "@/lib/pro-gate";

const AI_SURFACES: ProFeature[] = ["autoCaptions", "captionTranslate", "aiPortrait", "aiAvatar"];

const drop = (store: EditorStore, tab: string, id: string) => {
  const placed = applyPresetAt(store, tab, id, {
    time: 1,
    pxPerSec: 80,
    width: 1920,
    height: 1080,
  });
  return { placed, blocks: store.get().timeline.tracks.reduce((n, t) => n + t.clips.length, 0) };
};

describe("pro gate", () => {
  beforeEach(() => vi.mocked(toast.info).mockClear());

  it("locks every AI surface in this build", () => {
    for (const feature of AI_SURFACES) {
      expect(PRO_AVAILABLE[feature], feature).toBe(false);
      expect(proLocked(feature), feature).toBe(true);
    }
  });

  it("answers a locked feature with 'coming soon in Pro' and a working alternative", () => {
    for (const feature of AI_SURFACES) {
      const copy = PRO_COPY[feature];
      const title = copy.title.toLowerCase();
      expect(title, feature).toContain("coming soon");
      expect(title, feature).toContain("pro");
      // the point of the notice is that the rest of the editor still does the job another way
      expect(copy.body.length, feature).toBeGreaterThan(40);
    }
  });

  it("raises the same notice from every surface that tries the feature", () => {
    announcePro("autoCaptions");
    expect(toast.info).toHaveBeenCalledWith(PRO_COPY.autoCaptions.title, {
      description: PRO_COPY.autoCaptions.body,
    });
  });

  it("locks exactly the AI portrait effects, by catalog group", () => {
    const byGroup = EFFECTS.filter((e) => e.group === "AI portrait").map((e) => e.id);
    const byGate = EFFECTS.filter((e) => isProPreset("Effects", e.id)).map((e) => e.id);
    expect(byGate.length).toBeGreaterThan(0);
    expect(byGate).toEqual(byGroup);
    // a pixel-math effect is not gated, and no other library tab is
    expect(isProEffect("blur")).toBe(false);
    expect(isProPreset("Transitions", "mix")).toBe(false);
  });

  it("refuses to put a locked effect on the timeline, by + or by drop", () => {
    const locked = EFFECTS.find((e) => e.group === "AI portrait")!;
    const store = new EditorStore(defaultTimeline());
    const before = JSON.stringify(store.get().timeline);
    const attempt = drop(store, "Effects", locked.id);
    expect(attempt.placed).toBe(false);
    expect(attempt.blocks).toBe(0);
    // the timeline is untouched, not merely emptied: the drop never reached the placer
    expect(JSON.stringify(store.get().timeline)).toBe(before);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("still places an ordinary effect block", () => {
    const ok = drop(new EditorStore(defaultTimeline()), "Effects", "blur");
    expect(ok.placed).toBe(true);
    expect(ok.blocks).toBe(1);
    expect(toast.info).not.toHaveBeenCalled();
  });
});
