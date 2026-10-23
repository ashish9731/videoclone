/**
 * Preview performance governor.
 *
 * The layered compositor costs almost exactly proportional to pixels: a frame that needs 120ms at
 * 1280x720 needs ~30ms at 640x360, and a 30fps timeline only has 33ms of budget. Rendering one
 * stacked scene at full size starves the rAF loop, which is what makes the picture stutter *and*
 * the voice drift out of sync with it, so the preview resolution is traded for frame rate while
 * playing and given back in full as soon as the user pauses or scrubs.
 *
 * Only the preview uses this: export always renders at the project resolution through the same
 * `renderFrame`, so a degraded preview never changes a single pixel of the output.
 */

/** Long-side pixel budgets, best first. Index 0 is the size the preview used to always render at. */
export const PREVIEW_LEVELS = [1280, 1024, 800, 640, 512, 400, 320];
export const FULL_QUALITY = 0;

/** EMA weight of a new sample. */
const ALPHA = 0.3;
/** A frame this far over budget counts towards backing off. */
const OVER_BUDGET = 1.05;
/** ...and a frame this far under it counts towards stepping back up. */
const UNDER_BUDGET = 0.6;
/** Consecutive samples before a step: backing off reacts fast, recovering is cautious. */
const DOWN_FRAMES = 5;
const UP_FRAMES = 60;
/** A frame this far over budget is not a borderline call, so it backs off after only two samples. */
const BADLY_OVER = 2.2;
const BADLY_OVER_FRAMES = 2;
/** A back-off may skip several levels (cost is ~linear in pixels), but never all of them at once. */
const MAX_DOWN_JUMP = 3;
/** Head-room on top of the measured overload, so a computed landing level actually fits. */
const SAFETY = 1.2;
/** Samples that only feed the average: the frames right after a start/step are decode warm-up. */
const WARMUP_FRAMES = 8;
/** After any step, wait this long before the opposite move so levels can't flap. */
const COOLDOWN_MS = 1500;

export interface PerfState {
  level: number;
  ema: number;
  frames: number;
  slow: number;
  fast: number;
  armedAt: number;
}

export const createPerfState = (): PerfState => ({
  level: FULL_QUALITY,
  ema: 0,
  frames: 0,
  slow: 0,
  fast: 0,
  armedAt: -Infinity,
});

/**
 * Feed one measured render cost (ms) against the frame budget (ms) and return the level to use.
 * Mutates the state in place - the caller holds it in a ref and only reacts when the level changes.
 * An unmeasurable cost (0/NaN, i.e. a frame that was skipped or deduplicated) is ignored so it
 * can't bias the average.
 */
export function observePerfFrame(
  state: PerfState,
  now: number,
  costMs: number,
  budgetMs: number,
): number {
  if (!(costMs > 0) || !(budgetMs > 0)) return state.level;
  state.ema = state.frames === 0 ? costMs : state.ema * (1 - ALPHA) + costMs * ALPHA;
  state.frames++;
  // an unambiguous overload is acted on almost immediately; a borderline one needs a streak
  const badlyOver = state.frames >= 3 && state.ema > budgetMs * BADLY_OVER;
  if (state.frames < WARMUP_FRAMES && !badlyOver) return state.level;
  if (state.ema > budgetMs * OVER_BUDGET) {
    state.fast = 0;
    state.slow++;
  } else if (state.ema < budgetMs * UNDER_BUDGET) {
    state.slow = 0;
    state.fast++;
  } else {
    // inside the band both counters decay so a rare outlier can't accumulate a step
    state.slow = Math.max(0, state.slow - 2);
    state.fast = Math.max(0, state.fast - 2);
  }
  if (
    state.slow >= (badlyOver ? BADLY_OVER_FRAMES : DOWN_FRAMES) &&
    state.level < PREVIEW_LEVELS.length - 1
  ) {
    // Frame cost is essentially the pixel count, so the level that fits is solvable for instead of
    // crawling down one step at a time - a heavy scene otherwise stutters for seconds before it
    // reaches a size this machine can actually play.
    const overload = (state.ema / budgetMs) * SAFETY;
    const wanted = PREVIEW_LEVELS[state.level]! / Math.sqrt(overload);
    let next = state.level;
    while (next < PREVIEW_LEVELS.length - 1 && PREVIEW_LEVELS[next + 1]! > wanted) next++;
    // the measurement already said this level does not fit, so a prediction that lands between two
    // rungs still has to move - never stay put
    state.level = Math.min(Math.max(next, state.level + 1), state.level + MAX_DOWN_JUMP);
    state.slow = 0;
    state.frames = 0;
    state.ema = 0;
    state.armedAt = now + COOLDOWN_MS;
  } else if (state.fast >= UP_FRAMES && state.level > FULL_QUALITY && now >= state.armedAt) {
    // recovering is deliberately a single cautious step: overshooting costs the smooth playback again
    state.level--;
    state.fast = 0;
    state.frames = 0;
    state.ema = 0;
    state.armedAt = now + COOLDOWN_MS;
  }
  return state.level;
}

/** Forget what was measured so far, keeping the learned level (called when playback (re)starts). */
export function resetPerfWindow(state: PerfState) {
  state.ema = 0;
  state.frames = 0;
  state.slow = 0;
  state.fast = 0;
}

/** Long-side budget for a level, never larger than the project's own long side. */
export const levelSize = (level: number, projectLongSide: number) =>
  Math.min(PREVIEW_LEVELS[level] ?? PREVIEW_LEVELS[0]!, projectLongSide);

/** Preview scale for a level: the project size is never upscaled. */
export function levelScale(level: number, width: number, height: number): number {
  const longSide = Math.max(width, height);
  return Math.min(1, levelSize(level, longSide) / longSide);
}

// ---------- media resync ----------

/** Drift below this is left alone: it is under the audible threshold and chasing it costs seeks. */
const SYNC_DEADZONE = 0.04;
/**
 * Time a freshly started (or re-seeked) stream is left exactly at its own rate. Sources do not spin
 * up instantly: decode, buffer fill and the preview governor settling all cost time in the first
 * second, and the element looks like it is "lagging" while it is only starting up. Correcting that
 * made the voice run fast and high-pitched on every play press, which is what this window forbids.
 */
const SYNC_START_GRACE_MS = 1000;
/** How long a gap has to survive before it counts as drift rather than startup latency. */
const SYNC_SETTLE_MS = 600;
/** Drift this large (or bigger) gets the full correction; smaller gaps scale linearly below it. */
const SYNC_FULL_NUDGE_DRIFT = 0.3;
/**
 * Hard limit on the correction. Preview elements do not preserve pitch, so anything generous here is
 * heard as the audio speeding up: this is the largest shift that stays below notice.
 */
const SYNC_MAX_NUDGE = 0.06;
/**
 * A gap this big is not something to ease away over ten seconds: it is a different position, and one
 * decisive re-alignment is worth the click. It is only ever considered after the grace and settle
 * windows, so a start-up lag can never turn into a burst of stream restarts.
 */
const SYNC_SEEK_DRIFT = 0.5;
/** While paused, position is snapped to the target within this tolerance. */
const SYNC_PAUSED_TOLERANCE = 0.02;

export interface ResyncResult {
  /** Set `currentTime` to the target. */
  seek: boolean;
  /** Playback rate to apply (nominal rate when no correction is needed). */
  rate: number;
}

/**
 * Per-element memory for `resyncMedia`: when playback started, when the current gap was first seen,
 * and whether this entrance has been placed yet. Owned by the caller (one gate per clip) so the
 * decision itself stays a pure function.
 */
export interface SyncGate {
  startedAt: number;
  since: number;
  wasPlaying: boolean;
  /** False right after a clip enters the timeline: its element must be placed, not corrected. */
  positioned: boolean;
}

export const createSyncGate = (): SyncGate => ({
  startedAt: Number.NEGATIVE_INFINITY,
  since: Number.NEGATIVE_INFINITY,
  wasPlaying: false,
  positioned: false,
});

/**
 * Decide how to keep a playing media element in step with the timeline.
 *
 * A hard `currentTime =` seek interrupts the audio stream, so a stalled preview used to click and
 * drop words every time drift crossed the old quarter-second threshold. Small persistent gaps are
 * instead removed by easing the element's rate, and only once the gap has proven itself: startup is
 * left completely alone and the nominal rate is whatever the user's clip speed says.
 *
 * `drift` is `elementTime - targetTime`, so positive means the element is running ahead.
 */
export function resyncMedia(params: {
  now: number;
  playing: boolean;
  seeking: boolean;
  drift: number;
  rate: number;
  gate: SyncGate;
  pausedTolerance?: number;
}): ResyncResult {
  const nominal = params.rate;
  const gate = params.gate;

  if (!params.playing) {
    // a stop/restart always gets a fresh grace window, and an old streak must not carry over
    gate.wasPlaying = false;
    gate.since = Number.NEGATIVE_INFINITY;
    const tol = params.pausedTolerance ?? SYNC_PAUSED_TOLERANCE;
    return { seek: Math.abs(params.drift) > tol, rate: nominal };
  }
  if (!gate.wasPlaying) {
    gate.wasPlaying = true;
    gate.startedAt = params.now;
    gate.since = Number.NEGATIVE_INFINITY;
  }
  // never stack seeks on an element that is still seeking; the rate is still reset so it does not
  // stay stuck at a correction after the seek lands
  if (params.seeking) return { seek: false, rate: nominal };

  const drift = params.drift;
  const magnitude = Math.abs(drift);
  if (params.now - gate.startedAt < SYNC_START_GRACE_MS) return { seek: false, rate: nominal };
  if (magnitude > SYNC_SEEK_DRIFT) {
    gate.startedAt = params.now;
    gate.since = Number.NEGATIVE_INFINITY;
    return { seek: true, rate: nominal };
  }
  if (magnitude <= SYNC_DEADZONE) {
    gate.since = Number.NEGATIVE_INFINITY;
    return { seek: false, rate: nominal };
  }
  if (!isFinite(gate.since)) {
    gate.since = params.now;
    return { seek: false, rate: nominal };
  }
  if (params.now - gate.since < SYNC_SETTLE_MS) return { seek: false, rate: nominal };
  // The element advances at nominal*correction while the target advances at nominal, so the gap
  // closes at nominal*(1-correction) per second - slow on purpose, because pitch is not preserved.
  const strength = Math.min(1, magnitude / SYNC_FULL_NUDGE_DRIFT) * SYNC_MAX_NUDGE;
  const corr = 1 - Math.sign(drift) * strength;
  return { seek: false, rate: nominal * corr };
}

// ---------- preview paint gating ----------

/**
 * How long a stopped frame holds the previous picture while a source is still seeking or buffering
 * before painting anyway. Long enough for a seek to land (tens of milliseconds), short enough that
 * a dead media URL can never pin the player to a frame from somewhere else in the timeline.
 */
export const PAINT_SETTLE_MS = 700;
/**
 * A repositioned element is not to be trusted for this long: `seeking` only turns true in a task,
 * and the frame it presents is still the old one, so a frame painted inside that window is not the
 * one the user stopped on.
 */
export const SEEK_HOLD_MS = 500;

export interface PreviewPaintGate {
  /** the canvas does not currently show the frame for this (timeline, time) */
  stale: boolean;
  /** the frame the canvas shows was painted with every source it needs already decoded */
  complete: boolean;
  /** the timeline is playing */
  playing: boolean;
  /** every source the frame at this time needs is decodable right now */
  ready: boolean;
  /** ms this exact frame has already been waiting for a source */
  waitingMs: number;
  /** the canvas holds no usable picture at all (it was just resized, or nothing has been drawn yet) */
  blank: boolean;
  /** an earlier frame was painted completely, so it can be put back on the stage */
  frozen: boolean;
}

export type PreviewPaintAction = "skip" | "wait" | "hold" | "paint";

/**
 * Decide what the preview loop does on one animation frame.
 *
 * `renderFrame` fills the stage black and paints a layer only where the source already has a
 * picture, and a stop is exactly the moment that goes wrong: pausing hands the canvas back to full
 * quality (whose resize empties it) and repositions the video with a snap seek, so the single frame
 * drawn on that edge can be an empty one. A rule that only asked whether the sources were ready
 * *now* then went idle the instant the seek landed, leaving the player on the black frame it had painted
 * mid-seek. So an unfinished paint is its own dirty condition: repaint as soon as a missing source
 * arrives, and never while it is still absent.
 *
 * "wait" trusts the canvas to still be showing the last good frame. It is not always: the resize that
 * full quality triggers wipes it, which is why the loop also keeps a snapshot and gets "hold" - put
 * the snapshot back instead of drawing an empty stage over it.
 */
export function previewPaintAction(
  g: PreviewPaintGate,
  settleMs = PAINT_SETTLE_MS,
): PreviewPaintAction {
  // a running stream has to follow the clock even when the time did not move
  if (g.playing) return "paint";
  if (!g.stale) {
    // the canvas is meant to be showing this frame already but was wiped: redraw the snapshot, it
    // is the same scene, rather than leaving the stage empty until something happens to dirty it
    if (g.blank && g.frozen) return "hold";
    // the canvas already shows this frame correctly, or is still missing a source it already tried
    // to paint: re-painting the same empty result every frame is what starved the video.
    if (g.complete || !g.ready) return "skip";
    return "paint";
  }
  // a new frame, but a source has no picture yet: keep showing the last complete one briefly
  // instead of flashing an empty stage, then paint best-effort once the budget runs out.
  if (!g.ready && (g.complete || g.frozen) && g.waitingMs < settleMs) {
    return g.blank ? "hold" : "wait";
  }
  return "paint";
}
