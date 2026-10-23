import { describe, expect, it } from "vitest";
import {
  FULL_QUALITY,
  PAINT_SETTLE_MS,
  PREVIEW_LEVELS,
  createPerfState,
  createSyncGate,
  levelScale,
  observePerfFrame,
  previewPaintAction,
  resyncMedia,
  type PerfState,
  type PreviewPaintGate,
  type ResyncResult,
  type SyncGate,
} from "@/lib/editor/perf";

const BUDGET = 1000 / 30;

/** Feed `n` frames of the same cost, returning the level after each one. */
function feed(state: PerfState, cost: number, n: number, from = 0) {
  let level = state.level;
  for (let i = 0; i < n; i++) level = observePerfFrame(state, from + i * BUDGET, cost, BUDGET);
  return level;
}

/**
 * Closed loop: unlike a fixed cost, a real render gets cheaper when the level does (this is the
 * number measured for two filtered/adjusted layers with a transition and two effect blocks), so the
 * controller has to converge on a size instead of sliding all the way to the floor.
 */
const HEAVY_AT_FULL = 233;
const sceneMs = (level: number) => {
  const linear = PREVIEW_LEVELS[level]! / PREVIEW_LEVELS[FULL_QUALITY]!;
  return HEAVY_AT_FULL * linear * linear;
};
function settle(state: PerfState, costOfLevel: (level: number) => number, frames: number) {
  const trace: number[] = [];
  for (let i = 0; i < frames; i++) {
    trace.push(observePerfFrame(state, (i + 1) * BUDGET, costOfLevel(state.level), BUDGET));
  }
  return trace;
}

describe("observePerfFrame", () => {
  it("stays at full quality when the scene fits the budget", () => {
    const s = createPerfState();
    expect(feed(s, 8, 400)).toBe(FULL_QUALITY);
  });

  it("finds a playable size for a heavy scene inside two seconds, then stops there", () => {
    const s = createPerfState();
    const trace = settle(s, sceneMs, 120);
    const fitted = trace.findIndex((level, i) => i > 3 && sceneMs(level) <= BUDGET * 1.05);
    expect(fitted).toBeGreaterThan(-1);
    expect(fitted).toBeLessThan(60);
    // it does not keep degrading once the budget is met, and the size it picked is never upscaled
    expect(trace[trace.length - 1]).toBe(trace[fitted]!);
    expect(PREVIEW_LEVELS[s.level]!).toBeLessThan(PREVIEW_LEVELS[FULL_QUALITY]!);
    expect(sceneMs(s.level)).toBeLessThanOrEqual(BUDGET * 1.05);
  });

  it("stops at the floor level when even that is not enough", () => {
    const s = createPerfState();
    settle(s, () => 4000, 400);
    expect(s.level).toBe(PREVIEW_LEVELS.length - 1);
  });

  it("recovers quality once the load goes away, one cautious step at a time", () => {
    const s = createPerfState();
    const stuck = feed(s, 120, 20);
    expect(stuck).toBeGreaterThan(FULL_QUALITY);
    const half = feed(s, 5, 120, 10_000);
    expect(half).toBeLessThan(stuck);
    expect(feed(s, 5, 900, 30_000)).toBe(FULL_QUALITY);
  });

  it("ignores unmeasurable samples", () => {
    const s = createPerfState();
    expect(observePerfFrame(s, 0, 0, BUDGET)).toBe(FULL_QUALITY);
    expect(observePerfFrame(s, 0, Number.NaN, BUDGET)).toBe(FULL_QUALITY);
    expect(s.frames).toBe(0);
  });
});

describe("levelScale", () => {
  it("keeps the historic 1280 cap at full quality and never upscales", () => {
    expect(levelScale(0, 1920, 1080)).toBeCloseTo(1280 / 1920, 6);
    expect(levelScale(0, 640, 360)).toBe(1);
    expect(levelScale(0, 1080, 1920)).toBeCloseTo(1280 / 1920, 6);
  });

  it("shrinks the long side with the level", () => {
    expect(1920 * levelScale(0, 1920, 1080)).toBeCloseTo(PREVIEW_LEVELS[0]!, 6);
    expect(1920 * levelScale(PREVIEW_LEVELS.length - 1, 1920, 1080)).toBeCloseTo(
      PREVIEW_LEVELS[PREVIEW_LEVELS.length - 1]!,
      6,
    );
  });
});

describe("resyncMedia", () => {
  /** Play `frames` ticks 33ms apart with a constant gap and return every decision. */
  function drive(
    gate: SyncGate,
    o: { drift: number; frames: number; rate?: number; from?: number; stepMs?: number },
  ): ResyncResult[] {
    const stepMs = o.stepMs ?? 33;
    const out: ResyncResult[] = [];
    for (let i = 0; i < o.frames; i++) {
      out.push(
        resyncMedia({
          now: (o.from ?? 0) + i * stepMs,
          playing: true,
          seeking: false,
          drift: o.drift,
          rate: o.rate ?? 1,
          gate,
        }),
      );
    }
    return out;
  }

  it("keeps the clip's own speed through the whole start-up of a lagging stream", () => {
    // this is the case that made the voice run fast on every press of play: the element is behind
    // while it buffers/decodes, and that is not drift
    const gate = createSyncGate();
    const run = drive(gate, { drift: -0.9, frames: 28 });
    expect(run.every((r) => r.rate === 1 && !r.seek)).toBe(true);
  });

  it("leaves drift inside the deadzone alone for the entire playback", () => {
    const gate = createSyncGate();
    const run = drive(gate, { drift: 0.02, frames: 200 });
    expect(run.every((r) => r.rate === 1 && !r.seek)).toBe(true);
  });

  it("heals a persistent gap only after it survives start-up and the settle window, and gently", () => {
    const gate = createSyncGate();
    const run = drive(gate, { drift: -0.15, frames: 150 });
    // first the grace window, then the gap has to be seen standing still
    expect(run.slice(0, 25).every((r) => r.rate === 1 && !r.seek)).toBe(true);
    const last = run[run.length - 1]!;
    expect(last.seek).toBe(false);
    expect(last.rate).toBeGreaterThan(1);
    // pitch is not preserved, so a correction this side of ~6% is the most that may be audible
    expect(last.rate).toBeLessThanOrEqual(1.06);
  });

  it("slows a stream that is running ahead by the same bounded amount", () => {
    const gate = createSyncGate();
    const last = drive(gate, { drift: 0.4, frames: 150 })[149]!;
    expect(last.rate).toBeLessThan(1);
    expect(last.rate).toBeGreaterThanOrEqual(0.94);
  });

  it("scales the correction with the clip's own rate so a speed ramp keeps its pitch relationship", () => {
    const gate = createSyncGate();
    const last = drive(gate, { drift: -0.2, frames: 150, rate: 2 })[149]!;
    expect(last.rate).toBeGreaterThan(2);
    expect(last.rate).toBeLessThanOrEqual(2 * 1.06);
  });

  it("seeks a genuinely large gap, but re-arms its grace window after each one", () => {
    const gate = createSyncGate();
    const run = drive(gate, { drift: 1.2, frames: 60, stepMs: 100 });
    const seekFrames = run.map((r, i) => (r.seek ? i : -1)).filter((i) => i >= 0);
    // nothing at all is touched during the first second, even for a gap this size
    expect(seekFrames[0]).toBe(10);
    expect(seekFrames.length).toBeGreaterThan(1);
    // ...and a persistent gap is re-seeked at most once a second, never every frame
    for (let i = 1; i < seekFrames.length; i++) {
      expect(seekFrames[i]! - seekFrames[i - 1]!).toBeGreaterThanOrEqual(10);
    }
    expect(run.every((r) => r.rate === 1)).toBe(true);
  });

  it("never stacks a seek on a pending one", () => {
    const gate = createSyncGate();
    drive(gate, { drift: 0, frames: 1 });
    expect(
      resyncMedia({ now: 5000, playing: true, seeking: true, drift: 5, rate: 1, gate }),
    ).toEqual({ seek: false, rate: 1 });
  });

  it("arms a fresh grace window when playback is restarted", () => {
    const gate = createSyncGate();
    const warm = drive(gate, { drift: -0.2, frames: 150 });
    expect(warm[warm.length - 1]!.rate).toBeGreaterThan(1);
    expect(
      resyncMedia({ now: 6000, playing: false, seeking: false, drift: -0.2, rate: 1, gate }).rate,
    ).toBe(1);
    expect(
      resyncMedia({ now: 6100, playing: true, seeking: false, drift: -0.2, rate: 1, gate }),
    ).toEqual({ seek: false, rate: 1 });
  });

  it("snaps to the target while paused", () => {
    const gate = createSyncGate();
    const args = { now: 0, playing: false, seeking: false, rate: 1, gate };
    expect(resyncMedia({ ...args, drift: 0.05 }).seek).toBe(true);
    expect(resyncMedia({ ...args, drift: 0.005 }).seek).toBe(false);
    expect(resyncMedia({ ...args, drift: 0.05 }).rate).toBe(1);
  });

  it("leaves entrance placement to the caller and never touches it", () => {
    const gate = createSyncGate();
    expect(gate.positioned).toBe(false);
    drive(gate, { drift: -0.8, frames: 60 });
    expect(gate.positioned).toBe(false);
  });

  it("keeps a clip that was just placed for its entrance at nominal speed", () => {
    // mirrors Preview's order: place the element on the first in-range frame, re-arm, then resync -
    // so a clip entering mid-playback starts at the right position without being rushed into step
    const gate = createSyncGate();
    let target = 5;
    let el = 0;
    const run: ResyncResult[] = [];
    for (let i = 0; i < 45; i++) {
      const now = i * 33;
      target += 1 / 30;
      if (!gate.positioned) {
        gate.positioned = true;
        gate.startedAt = now;
        gate.since = Number.NEGATIVE_INFINITY;
        gate.wasPlaying = true;
        if (Math.abs(el - target) > 0.05) el = target;
      }
      const r = resyncMedia({
        now,
        playing: true,
        seeking: false,
        drift: el - target,
        rate: 1,
        gate,
      });
      run.push(r);
      el += (1 / 30) * r.rate;
    }
    expect(run.every((r) => r.rate === 1 && !r.seek)).toBe(true);
  });
});

describe("previewPaintAction", () => {
  /** a stopped player whose canvas correctly shows the frame it was asked for */
  const settled: PreviewPaintGate = {
    stale: false,
    complete: true,
    playing: false,
    ready: true,
    waitingMs: 0,
    blank: false,
    frozen: false,
  };
  const at = (over: Partial<PreviewPaintGate>) => previewPaintAction({ ...settled, ...over });

  it("never leaves a stopped player on a frame it painted without a source", () => {
    // the canvas holds the empty mid-seek paint; the seek has now landed
    expect(at({ complete: false, ready: true })).toBe("paint");
  });
  it("paints while the timeline runs, even on a frame it has already drawn", () => {
    expect(at({ playing: true })).toBe("paint");
    expect(at({ playing: true, stale: false, complete: true, ready: true })).toBe("paint");
  });
  it("does not redraw an idle frame that is already on screen", () => {
    expect(at({})).toBe("skip");
  });
  it("stops redrawing a frame it already attempted while its source is still missing", () => {
    // this is the pass that used to run the composite at display refresh rate for nothing
    expect(at({ complete: false, ready: false })).toBe("skip");
  });
  it("holds the last good picture briefly instead of flashing an empty stage", () => {
    expect(at({ stale: true, ready: false, waitingMs: 0 })).toBe("wait");
    expect(at({ stale: true, ready: false, waitingMs: PAINT_SETTLE_MS - 1 })).toBe("wait");
  });
  it("gives up waiting on a source that never arrives, so the frame is at least attempted", () => {
    expect(at({ stale: true, ready: false, waitingMs: PAINT_SETTLE_MS })).toBe("paint");
    // with nothing proper on the canvas there is no picture worth holding, so it paints at once
    expect(at({ stale: true, ready: false, complete: false })).toBe("paint");
  });

  it("puts the snapshot back when the canvas it was relying on got wiped", () => {
    // pausing resizes the stage to full quality, which empties the bitmap, and the seek it started
    // has not landed: "wait" would be leaving a black canvas on screen
    expect(at({ stale: true, ready: false, blank: true, frozen: true })).toBe("hold");
    // even a frame the loop thinks it is showing correctly, if the bitmap is gone, is not on screen
    expect(at({ blank: true, frozen: true })).toBe("hold");
    // one hold is enough: the stage has a picture again, so the next pass just waits for the decode
    expect(at({ stale: true, ready: false, blank: false, frozen: true })).toBe("wait");
  });
  it("paints instead of holding when there is no snapshot to hold", () => {
    expect(at({ stale: true, ready: false, blank: true, frozen: false, complete: false })).toBe(
      "paint",
    );
  });
  it("still paints once the wait expires, snapshot or not", () => {
    expect(
      at({ stale: true, ready: false, waitingMs: PAINT_SETTLE_MS, blank: true, frozen: true }),
    ).toBe("paint");
  });
});
