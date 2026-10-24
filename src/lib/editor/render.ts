import { applyKey } from "./key";
import { visualFadeAt } from "./clip-controls";
import { applyMask } from "./mask";
import { animState } from "./anim";
import {
  applyGlobalFx,
  blurInPlace,
  clear,
  ctx2d,
  gradeFrame,
  pixelate,
  poolCanvas,
  processLayer,
} from "./fx";
import { drawShape } from "./shapes";
import { drawTransition, nextAdjacent, prevAdjacent, transitionBlockSpan } from "./transitions";
import { drawWatermark, type WatermarkImageGetter } from "./watermark";
import {
  type CaptionTrack,
  type Clip,
  type Timeline,
  type Track,
  type Watermark,
  clipDuration,
  interpolate,
  isActive,
  isVisualClip,
} from "./types";

export type SourceGetter = (clip: Clip) => CanvasImageSource | null;

function sourceSize(src: CanvasImageSource): [number, number] {
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement)
    return [src.videoWidth, src.videoHeight];
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement)
    return [src.naturalWidth, src.naturalHeight];
  const s = src as { width: number; height: number };
  return [s.width, s.height];
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

type LineCache = { key: string; maxW: number; text: string; lines: string[] };
const lineCache = new WeakMap<object, LineCache>();

/**
 * Line breaking is word-by-word measurement, and the same text style object is drawn on every
 * frame of a clip; the style object is replaced on any edit, so caching it is self-invalidating.
 * `key` has to describe everything that changes measurement (font, letter spacing).
 */
function cachedLines(
  style: object,
  ctx: CanvasRenderingContext2D,
  text: string,
  key: string,
  maxW: number,
): string[] {
  const hit = lineCache.get(style);
  if (hit && hit.key === key && hit.maxW === maxW && hit.text === text) return hit.lines;
  const lines = wrapLines(ctx, text, maxW);
  lineCache.set(style, { key, maxW, text, lines });
  return lines;
}

interface TextOpts {
  color: string;
  background: string;
  stroke: string;
  strokeWidth: number;
  align: CanvasTextAlign;
  glowColor?: string | undefined;
  glowSize?: number | undefined;
  reveal?: number | undefined;
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  cx: number,
  cy: number,
  size: number,
  opts: TextOpts,
) {
  const lh = size * 1.25;
  const total = lh * lines.length;
  ctx.textAlign = opts.align;
  ctx.textBaseline = "middle";
  let maxW = 0;
  for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
  const pad = size * 0.3;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    const bx = opts.align === "center" ? cx - maxW / 2 : opts.align === "left" ? cx : cx - maxW;
    ctx.beginPath();
    ctx.roundRect(bx - pad, cy - total / 2 - pad * 0.5, maxW + pad * 2, total + pad, size * 0.2);
    ctx.fill();
  }
  // typewriter: reveal characters across lines in order
  let budget = Infinity;
  if (opts.reveal !== undefined && opts.reveal < 1) {
    const chars = lines.reduce((n, l) => n + l.length, 0);
    budget = Math.floor(chars * Math.max(0, opts.reveal));
  }
  const bx = opts.align === "center" ? cx - maxW / 2 : opts.align === "left" ? cx : cx - maxW;
  lines.forEach((full, i) => {
    if (budget <= 0) return;
    const l = full.slice(0, budget);
    budget -= full.length;
    const y = cy - total / 2 + lh * (i + 0.5);
    // keep partially revealed lines anchored where the full line would sit
    let x = cx;
    if (l.length < full.length) {
      ctx.textAlign = "left";
      const fw = ctx.measureText(full).width;
      x = opts.align === "center" ? cx - fw / 2 : opts.align === "left" ? bx : cx - fw;
    }
    if (opts.strokeWidth > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = opts.strokeWidth * 2;
      ctx.strokeStyle = opts.stroke;
      ctx.strokeText(l, x, y);
    }
    if (opts.glowColor && (opts.glowSize ?? 0) > 0) {
      ctx.shadowColor = opts.glowColor;
      ctx.shadowBlur = opts.glowSize!;
      ctx.fillStyle = opts.color;
      ctx.fillText(l, x, y);
      ctx.fillText(l, x, y);
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }
    ctx.fillStyle = opts.color;
    ctx.fillText(l, x, y);
    ctx.textAlign = opts.align;
  });
}

export interface RenderOptions {
  width: number;
  height: number;
  /** project-space size the transforms/text sizes are authored in */
  baseHeight: number;
  captions?: CaptionTrack[];
  /** read from EditorState, never from `timeline`, so timeline edits can never drop it */
  watermark?: Watermark | undefined;
  /** resolves the watermark logo asset to an image; omitted means a logo watermark cannot paint */
  getWatermarkImage?: WatermarkImageGetter | undefined;
}

export function textFont(s: NonNullable<Clip["text"]>, size: number) {
  return `${s.italic ? "italic " : ""}${s.bold ? "700" : "400"} ${size}px "${s.fontFamily}", sans-serif`;
}

/** Render one clip (transform, animation, effects) into a full-frame transparent layer. */
export function renderClipLayer(
  key: string,
  c: Clip,
  t: number,
  getSource: SourceGetter,
  W: number,
  H: number,
  baseHeight: number,
): HTMLCanvasElement | null {
  const L = poolCanvas(key, W, H);
  clear(L);
  const x = ctx2d(L);
  const k = H / baseHeight;
  const s1080 = H / 1080;
  const d = clipDuration(c);
  const local = t - c.start;
  const kl = Math.max(0, Math.min(d, local)); // keyframes/anims hold their end state in transition tails
  const a = animState(c, kl, d);
  const pose = {
    x: interpolate(c.keyframes.x, kl, c.transform.x),
    y: interpolate(c.keyframes.y, kl, c.transform.y),
    scale: interpolate(c.keyframes.scale, kl, c.transform.scale),
    rotation: interpolate(c.keyframes.rotation, kl, c.transform.rotation),
    opacity: interpolate(c.keyframes.opacity, kl, c.transform.opacity),
  };
  const opacity = Math.max(
    0,
    Math.min(1, pose.opacity * a.opacity * visualFadeAt(c, Math.max(c.start, t))),
  );
  if (opacity <= 0.001) return null;

  x.save();
  x.globalAlpha = opacity;
  x.translate(W / 2 + pose.x * k + a.fx * W, H / 2 + pose.y * k + a.fy * H);
  x.rotate(((pose.rotation + a.rotation) * Math.PI) / 180);
  const sc = pose.scale * a.scale;
  x.scale(sc, sc);

  const wipeBox = (w: number, h: number) => {
    if (a.wipe < 1) {
      x.beginPath();
      x.rect(-w / 2, -h / 2 - 2, w * a.wipe, h + 4);
      x.clip();
    }
  };

  let drew = false;
  if (c.kind === "text" && c.text) {
    const s = c.text;
    const size = s.fontSize * k;
    x.font = textFont(s, size);
    const ls = (s.letterSpacing ?? 0) * k;
    const xl = x as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in xl) xl.letterSpacing = `${ls}px`;
    const lines = cachedLines(s, x, s.content, `${textFont(s, size)}|${ls}px`, W * 0.9);
    let mw = 0;
    for (const l of lines) mw = Math.max(mw, x.measureText(l).width);
    wipeBox(mw + size, lines.length * size * 1.25 + size);
    drawTextBlock(x, lines, 0, 0, size, {
      color: s.color,
      background: s.background,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth * k,
      align: s.align,
      glowColor: s.glowColor,
      glowSize: (s.glowSize ?? 0) * k,
      reveal: a.reveal,
    });
    drew = true;
  } else if (c.kind === "shape" && c.shape) {
    wipeBox(c.shape.w * k, c.shape.h * k);
    drawShape(x, c.shape, k, kl);
    drew = true;
  } else {
    const src = getSource(c);
    if (src) {
      const [sw, sh] = sourceSize(src);
      if (sw > 0 && sh > 0) {
        const crop = c.crop ?? { x: 0, y: 0, w: 1, h: 1 };
        const cw = sw * crop.w,
          ch = sh * crop.h;
        const fit = Math.min(W / cw, H / ch);
        const dw = cw * fit,
          dh = ch * fit;
        wipeBox(dw, dh);
        x.drawImage(src, sw * crop.x, sh * crop.y, cw, ch, -dw / 2, -dh / 2, dw, dh);
        drew = true;
      }
    }
  }
  x.restore();
  if (!drew) return null;

  if (a.blur > 0.3) blurInPlace(L, a.blur * s1080);
  applyKey(L, c.chroma);
  const post = processLayer(L, c.effects, c.filter, c.fx, Math.max(0, local), s1080, d);
  if (post.dx || post.dy || post.scale !== 1 || post.rotation) {
    const tmp = poolCanvas(key + "-post", W, H);
    clear(tmp);
    const tx = ctx2d(tmp);
    tx.drawImage(L, 0, 0);
    clear(L);
    x.save();
    x.translate(W / 2 + post.dx, H / 2 + post.dy);
    x.rotate((post.rotation * Math.PI) / 180);
    x.scale(post.scale, post.scale);
    x.drawImage(tmp, -W / 2, -H / 2);
    x.restore();
  }
  applyMask(L, c.mask, local);
  return L;
}

/**
 * Standalone effect clips active at time t, ordered bottom-to-top (lowest z first).
 * A block repaints the whole frame, so its lane is irrelevant - only visibility matters.
 */
export function activeEffectClips(timeline: Timeline, t: number): Clip[] {
  const out: Clip[] = [];
  const tracks = timeline.tracks.filter((tr) => !tr.hidden);
  for (let i = tracks.length - 1; i >= 0; i--) {
    const tr = tracks[i]!;
    for (const c of tr.clips) if (c.kind === "effect" && isActive(c, t)) out.push(c);
  }
  return out;
}

/**
 * The grade blocks a lane is asking to be painted at time t. Unlike an effect block, a filter is
 * applied where its lane sits in the stack: it recolours the picture built at and below that line
 * and leaves the overlays drawn above it alone, which is what putting it on a line means.
 */
export function gradeBlocksInLane(tr: Track, t: number): Clip[] {
  return tr.clips.filter((c) => c.kind === "filter" && c.filter !== undefined && isActive(c, t));
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  timeline: Timeline,
  t: number,
  getSource: SourceGetter,
  o: RenderOptions,
) {
  const { width: W, height: H } = o;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  // bottom track renders first; tracks[0] is the top layer. Which clips draw is decided by
  // the clip's own kind, never by the lane type, so a visual clip or an effect block works
  // on every lane (effect blocks composite as full-frame passes after the base image).
  const visual = timeline.tracks.filter((tr) => !tr.hidden);
  for (let i = visual.length - 1; i >= 0; i--) {
    const tr = visual[i]!;
    // Clips whose incoming blend is painting them right now. The blend draws the outgoing side
    // itself, so that clip must not also paint its plain frame underneath - transformed effects
    // (push, zoom, slide) would otherwise double-expose the still frame and flicker.
    const blendedOutIds = new Set<string>();
    for (const c of tr.clips) {
      const tin = c.transitionIn;
      const block = tin && tin.duration > 0 ? transitionBlockSpan(c) : null;
      if (block && t >= block.start && t < block.start + block.duration) {
        const prev = prevAdjacent(tr, c);
        if (prev) blendedOutIds.add(prev.id);
      }
    }
    for (const c of tr.clips) {
      if (!isVisualClip(c)) continue;
      if (blendedOutIds.has(c.id)) continue;
      const tin = c.transitionIn;
      const block = tin && tin.duration > 0 ? transitionBlockSpan(c) : null;
      const inBlend = block !== null && t >= block.start && t < block.start + block.duration;
      if (!isActive(c, t) && !inBlend) continue;
      ctx.globalCompositeOperation = c.blend ?? "source-over";
      const d = clipDuration(c);
      const local = t - c.start;
      const tout = c.transitionOut;
      if (inBlend && block && tin) {
        const prev = prevAdjacent(tr, c);
        const from = prev
          ? renderClipLayer("layer-from", prev, t, getSource, W, H, o.baseHeight)
          : null;
        const to = renderClipLayer("layer-to", c, t, getSource, W, H, o.baseHeight);
        drawTransition(ctx, tin.type, (t - block.start) / block.duration, from, to);
        continue;
      }
      if (!isActive(c, t)) continue;
      const L = renderClipLayer("layer-to", c, t, getSource, W, H, o.baseHeight);
      const next = nextAdjacent(tr, c);
      const handoff = next?.transitionIn && next.transitionIn.duration > 0;
      if (tout && tout.duration > 0 && !handoff && local > d - tout.duration) {
        drawTransition(ctx, tout.type, (local - (d - tout.duration)) / tout.duration, L, null);
        continue;
      }
      if (L) ctx.drawImage(L, 0, 0);
    }
    // Grade blocks recolour the picture built so far, so a filter reaches the material at and
    // below its own lane and leaves the overlays above it alone - which is where the user put it.
    for (const c of gradeBlocksInLane(tr, t)) {
      if (c.filter) gradeFrame(ctx.canvas, c.filter);
    }
  }

  ctx.globalCompositeOperation = "source-over";

  // Global effect blocks: apply full-frame to the composited image, before captions.
  const effectClips = activeEffectClips(timeline, t);
  if (effectClips.length) {
    const frame = poolCanvas("global-frame", W, H);
    const fxc = ctx2d(frame);
    clear(frame);
    fxc.drawImage(ctx.canvas, 0, 0, W, H);
    for (const ec of effectClips)
      applyGlobalFx(frame, ec.fx ?? [], Math.max(0, t - ec.start), H / 1080, clipDuration(ec));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(frame, 0, 0);
    ctx.restore();
  }

  // captions on top
  if (o.captions) {
    for (const ct of o.captions) {
      if (!ct.visible) continue;
      const cue = ct.cues.find((q) => t >= q.start && t < q.end);
      if (!cue) continue;
      const s = ct.style;
      const size = s.fontSize * (H / 1080);
      ctx.save();
      ctx.globalAlpha = 1;
      const text = s.uppercase ? cue.text.toUpperCase() : cue.text;
      const font = `${s.bold ? "700" : "400"} ${size}px "${s.fontFamily}", sans-serif`;
      ctx.font = font;
      const lines = cachedLines(s, ctx, text, font, W * 0.82);
      drawTextBlock(ctx, lines, W / 2, H * s.position, size, {
        color: s.color,
        background: s.background,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth * (H / 1080),
        align: "center",
      });
      ctx.restore();
    }
  }

  // watermark paints last so it always sits above the picture and captions and is baked into export
  if (o.watermark) drawWatermark(ctx, o.watermark, W, H, o.getWatermarkImage);
  ctx.restore();
}
