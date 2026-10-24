import { describe, it, expect } from "vitest";
import { drawWatermark } from "../lib/editor/watermark";
import { defaultWatermark, type Watermark } from "../lib/editor/types";

/** Minimal 2D context that records the calls drawWatermark makes; jsdom has no real canvas. */
function recordingCtx() {
  const calls: { type: string; args: unknown[] }[] = [];
  const track =
    (type: string) =>
    (...args: unknown[]) => {
      calls.push({ type, args });
    };
  const ctx = {
    calls,
    font: "",
    fillStyle: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    globalCompositeOperation: "",
    filter: "",
    save: track("save"),
    restore: track("restore"),
    setTransform: track("setTransform"),
    translate: track("translate"),
    rotate: track("rotate"),
    fillText: track("fillText"),
    drawImage: track("drawImage"),
    measureText: (t: string) => ({ width: t.length * 10 }),
  };
  return ctx as unknown as CanvasRenderingContext2D & {
    calls: { type: string; args: unknown[] }[];
    globalAlpha: number;
  };
}

const textOf = (wm: Partial<Watermark>): Watermark => ({
  ...defaultWatermark(),
  enabled: true,
  kind: "text",
  ...wm,
});

describe("drawWatermark", () => {
  it("paints nothing when disabled", () => {
    const ctx = recordingCtx();
    drawWatermark(ctx, { ...defaultWatermark(), enabled: false }, 1000, 1000);
    expect(ctx.calls.some((c) => c.type === "fillText")).toBe(false);
  });

  it("stamps a single text mark in the chosen corner at the requested opacity", () => {
    const ctx = recordingCtx();
    drawWatermark(
      ctx,
      textOf({
        text: "AB",
        opacity: 0.4,
        position: "top-left",
        size: 0.1,
        padding: 0.05,
        tiled: false,
      }),
      1000,
      800,
    );
    const texts = ctx.calls.filter((c) => c.type === "fillText");
    expect(texts).toHaveLength(1);
    expect(texts[0]!.args[0]).toBe("AB");
    // size 0.1 of 800 => 80px; unit width = 2 chars * 10 = 20; pad = 0.05 * 800 = 40; centre x = 40 + unitW/2
    const translate = ctx.calls.find((c) => c.type === "translate")!;
    expect(translate.args[0]).toBeCloseTo(40 + 10);
    expect(translate.args[1]).toBeCloseTo(40 + 40);
    expect(ctx.globalAlpha).toBeCloseTo(0.4);
  });

  it("repeats many marks when tiled", () => {
    const ctx = recordingCtx();
    drawWatermark(ctx, textOf({ text: "WM", tiled: true, size: 0.05 }), 1000, 800);
    expect(ctx.calls.filter((c) => c.type === "fillText").length).toBeGreaterThan(4);
  });

  it("skips a logo watermark whose image is still missing", () => {
    const ctx = recordingCtx();
    drawWatermark(ctx, textOf({ kind: "logo", logoAssetId: "a" }), 1000, 800, () => null);
    expect(ctx.calls.some((c) => c.type === "drawImage")).toBe(false);
  });

  it("draws a logo when the getter resolves an image", () => {
    const ctx = recordingCtx();
    const img = { width: 200, height: 100 } as HTMLImageElement;
    drawWatermark(ctx, textOf({ kind: "logo", logoAssetId: "a" }), 1000, 800, () => img);
    const drawn = ctx.calls.filter((c) => c.type === "drawImage");
    expect(drawn).toHaveLength(1);
  });
});
