import { blurInPlace, clear, ctx2d, pixelate, poolCanvas, rgbSplit } from "./fx";
import { type Clip, type Track, clipEnd } from "./types";

export interface TransitionDef {
  id: string;
  name: string;
  group: "Basic" | "Slide" | "Wipe" | "Camera" | "Effects" | "Shape";
}

export const TRANSITIONS: TransitionDef[] = [
  { id: "fade", name: "Mix", group: "Basic" },
  { id: "dip-black", name: "Black fade", group: "Basic" },
  { id: "dip-white", name: "White flash", group: "Basic" },
  { id: "blur", name: "Blur", group: "Basic" },
  { id: "slide-left", name: "Slide left", group: "Slide" },
  { id: "slide-right", name: "Slide right", group: "Slide" },
  { id: "slide-up", name: "Slide up", group: "Slide" },
  { id: "slide-down", name: "Slide down", group: "Slide" },
  { id: "push-left", name: "Push left", group: "Slide" },
  { id: "push-right", name: "Push right", group: "Slide" },
  { id: "push-up", name: "Push up", group: "Slide" },
  { id: "push-down", name: "Push down", group: "Slide" },
  { id: "wipe-right", name: "Wipe right", group: "Wipe" },
  { id: "wipe-left", name: "Wipe left", group: "Wipe" },
  { id: "wipe-down", name: "Wipe down", group: "Wipe" },
  { id: "wipe-up", name: "Wipe up", group: "Wipe" },
  { id: "doors", name: "Open doors", group: "Wipe" },
  { id: "clock", name: "Clock wipe", group: "Wipe" },
  { id: "zoom-in", name: "Zoom in", group: "Camera" },
  { id: "zoom-out", name: "Zoom out", group: "Camera" },
  { id: "spin", name: "Spin", group: "Camera" },
  { id: "whip", name: "Whip pan", group: "Camera" },
  { id: "pixelate", name: "Pixelate", group: "Effects" },
  { id: "glitch", name: "Glitch", group: "Effects" },
  { id: "flash-zoom", name: "Flash zoom", group: "Effects" },
  { id: "iris", name: "Circle", group: "Shape" },
  { id: "diamond", name: "Diamond", group: "Shape" },
  { id: "heart", name: "Heart", group: "Shape" },
  { id: "blinds", name: "Blinds", group: "Shape" },
  { id: "cross-swipe", name: "Cross Swipe", group: "Wipe" },
  { id: "three-slides", name: "Three Slides II", group: "Slide" },
  { id: "liquid-morph", name: "Liquid Morph", group: "Effects" },
  { id: "tv-off", name: "TV Off", group: "Effects" },
  { id: "blaze-fall", name: "Blaze Fall", group: "Effects" },
  { id: "splitting-laser", name: "Splitting Laser", group: "Wipe" },
  { id: "checker", name: "Checker Reveal", group: "Shape" },
  { id: "diagonal", name: "Diagonal Sweep", group: "Wipe" },
];

const ALIAS: Record<string, string> = { zoom: "zoom-in", wipe: "wipe-right" };
export const transitionName = (id: string) => TRANSITIONS.find((t) => t.id === (ALIAS[id] ?? id))?.name ?? id;

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Gap tolerance (s) for treating two clips on a track as adjacent. */
export const ADJ_EPS = 0.05;

/** The clip immediately before `c` on the track (touching it), if any. */
export function prevAdjacent(track: Track, c: Clip): Clip | null {
  let best: Clip | null = null;
  for (const o of track.clips) {
    if (o.id === c.id) continue;
    if (Math.abs(clipEnd(o) - c.start) <= ADJ_EPS) best = o;
  }
  return best;
}
export function nextAdjacent(track: Track, c: Clip): Clip | null {
  const e = clipEnd(c);
  for (const o of track.clips) if (o.id !== c.id && Math.abs(o.start - e) <= ADJ_EPS) return o;
  return null;
}

/** Extra time a clip stays visible after its end, as the outgoing side of the next clip's transition. */
export function outgoingTail(track: Track, c: Clip): number {
  const n = nextAdjacent(track, c);
  return n?.transitionIn && n.transitionIn.duration > 0 ? n.transitionIn.duration : 0;
}

type Layer = HTMLCanvasElement | null;

function put(
  ctx: CanvasRenderingContext2D,
  L: Layer,
  o: { a?: number; x?: number; y?: number; s?: number; r?: number; clip?: (x: CanvasRenderingContext2D) => void } = {},
) {
  if (!L) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  if (o.clip) {
    ctx.beginPath();
    o.clip(ctx);
    ctx.clip();
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, o.a ?? 1));
  ctx.translate(W / 2 + (o.x ?? 0), H / 2 + (o.y ?? 0));
  if (o.r) ctx.rotate(o.r);
  const s = o.s ?? 1;
  ctx.scale(s, s);
  ctx.drawImage(L, -W / 2, -H / 2);
  ctx.restore();
}

function fill(ctx: CanvasRenderingContext2D, color: string, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function processed(L: Layer, key: string, fn: (c: HTMLCanvasElement) => void): Layer {
  if (!L) return null;
  const c = poolCanvas(key, L.width, L.height);
  clear(c);
  ctx2d(c).drawImage(L, 0, 0);
  fn(c);
  return c;
}

function heartPath(x: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s * 1.1, cy - s * 0.35, cx - s * 0.5, cy - s * 1.05, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.5, cy - s * 1.05, cx + s * 1.1, cy - s * 0.35, cx, cy + s * 0.35);
}

/**
 * Composite a transition at progress p (0..1) from layer `from` to layer `to`.
 * A null layer means "nothing" (lower tracks show through).
 */
export function drawTransition(ctx: CanvasRenderingContext2D, typeIn: string, pRaw: number, from: Layer, to: Layer) {
  const type = ALIAS[typeIn] ?? typeIn;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const p = Math.max(0, Math.min(1, pRaw));
  const e = ease(p);
  const diag = Math.hypot(W, H);
  if (type.startsWith('vector-')) {
    const [, family, index] = type.split('-');
    const angle = Number(index) * Math.PI / 4 - Math.PI / 2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    if (family === 'slide' || family === 'push') {
      put(ctx, from, family === 'push' ? { x: -dx * W * e, y: -dy * H * e } : {});
      put(ctx, to, { x: dx * W * (1 - e), y: dy * H * (1 - e) });
    } else if (family === 'zoom') {
      put(ctx, from, { s: 1 + e * 0.5, x: dx * W * e * 0.2, y: dy * H * e * 0.2 });
      put(ctx, to, { s: 0.2 + e * 0.8, x: dx * W * (1 - e), y: dy * H * (1 - e), a: p });
    } else {
      put(ctx, from);
      put(ctx, to, { clip: x => {
        // Half-plane reveal perpendicular to the requested direction.
        const extent = Math.abs(dx) * W + Math.abs(dy) * H;
        const edge = -extent / 2 + extent * e;
        const cx = W / 2 + dx * edge, cy = H / 2 + dy * edge;
        x.moveTo(cx - dy * diag, cy + dx * diag);
        x.lineTo(cx + dy * diag, cy - dx * diag);
        x.lineTo(cx + dy * diag - dx * diag * 2, cy - dx * diag - dy * diag * 2);
        x.lineTo(cx - dy * diag - dx * diag * 2, cy + dx * diag - dy * diag * 2); x.closePath();
      } });
    }
    return;
  }
  switch (type) {
    case 'cross-swipe':
      put(ctx, from);
      put(ctx, to, { clip: x => { x.rect(0, H / 2 - H * e / 2, W, H * e); x.rect(W / 2 - W * e / 2, 0, W * e, H); } });
      return;
    case 'checker':
      put(ctx, from);
      put(ctx, to, { clip: x => { for (let y = 0; y < 6; y++) for (let col = 0; col < 8; col++) { const q = Math.min(1, Math.max(0, e * 2 - ((y + col) % 2) * 0.5)); x.rect(col * W / 8, y * H / 6, W / 8 * q, H / 6 * q); } } });
      return;
    case 'three-slides': {
      put(ctx, from);
      for (let band = 0; band < 3; band++) put(ctx, to, { x: (band % 2 ? -1 : 1) * W * (1 - e), clip: x => x.rect(0, band * H / 3, W, H / 3) });
      return;
    }
    case 'diagonal':
      put(ctx, from);
      put(ctx, to, { clip: x => { const edge = (W + H) * e; x.moveTo(0, 0); x.lineTo(edge, 0); x.lineTo(edge - H, H); x.lineTo(0, H); x.closePath(); } });
      return;
    case 'splitting-laser':
      put(ctx, from);
      put(ctx, to, { clip: x => x.rect(W / 2 - W * e / 2, 0, W * e, H) });
      if (p > 0 && p < 1) { ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - W * e / 2, 0, 2, H); ctx.fillRect(W / 2 + W * e / 2, 0, 2, H); ctx.restore(); }
      return;
    case 'tv-off': {
      const L = p < 0.5 ? from : to;
      const sy = Math.max(0.005, Math.abs(2 * p - 1));
      ctx.save(); ctx.translate(0, H / 2); ctx.scale(1, sy); ctx.translate(0, -H / 2); put(ctx, L); ctx.restore();
      return;
    }
    case 'liquid-morph': {
      const L = p < 0.5 ? from : to;
      if (!L) return;
      const strength = Math.sin(p * Math.PI);
      const warped = processed(L, 'tr-liquid', c => {
        const src = poolCanvas('tr-liquid-copy', W, H); clear(src); ctx2d(src).drawImage(c, 0, 0); clear(c);
        const cx = ctx2d(c);
        for (let y = 0; y < H; y += 3) cx.drawImage(src, 0, y, W, 3, Math.sin(y / H * 18 + p * 12) * W * 0.08 * strength, y, W, 3);
      });
      put(ctx, warped); return;
    }
    case 'blaze-fall':
      put(ctx, from, { y: H * e, a: 1 - p }); put(ctx, to, { y: -H * (1 - e), a: p });
      fill(ctx, '#ff8b38', Math.sin(p * Math.PI) * 0.35); return;
    case "fade":
      if (to && from) {
        put(ctx, from);
        put(ctx, to, { a: p });
      } else {
        put(ctx, from, { a: 1 - p });
        put(ctx, to, { a: p });
      }
      return;
    case "dip-black":
    case "dip-white": {
      const col = type === "dip-black" ? "#000" : "#fff";
      if (p < 0.5) {
        put(ctx, from);
        fill(ctx, col, p * 2);
      } else {
        put(ctx, to);
        fill(ctx, col, (1 - p) * 2);
      }
      return;
    }
    case "blur": {
      const amt = Math.sin(p * Math.PI) * 40 * (H / 1080);
      put(ctx, processed(from, "tr-a", (c) => blurInPlace(c, amt)), { a: from && to ? 1 : 1 - p });
      put(ctx, processed(to, "tr-b", (c) => blurInPlace(c, amt)), { a: p });
      return;
    }
    case "slide-left":
    case "slide-right":
    case "slide-up":
    case "slide-down": {
      const [dx, dy] = type === "slide-left" ? [W, 0] : type === "slide-right" ? [-W, 0] : type === "slide-up" ? [0, H] : [0, -H];
      put(ctx, from);
      put(ctx, to, { x: dx * (1 - e), y: dy * (1 - e) });
      return;
    }
    case "push-left":
    case "push-right":
    case "push-up":
    case "push-down": {
      const [dx, dy] = type === "push-left" ? [W, 0] : type === "push-right" ? [-W, 0] : type === "push-up" ? [0, H] : [0, -H];
      put(ctx, from, { x: -dx * e, y: -dy * e });
      put(ctx, to, { x: dx * (1 - e), y: dy * (1 - e) });
      return;
    }
    case "whip": {
      const amt = Math.sin(p * Math.PI) * 60 * (W / 1920);
      if (p < 0.5) put(ctx, processed(from, "tr-a", (c) => blurInPlace(c, amt)), { x: -W * e * 0.6 });
      else put(ctx, processed(to, "tr-b", (c) => blurInPlace(c, amt)), { x: W * (1 - e) * 0.6 });
      return;
    }
    case "wipe-right":
    case "wipe-left":
    case "wipe-down":
    case "wipe-up": {
      put(ctx, from);
      put(ctx, to, {
        clip: (x) =>
          type === "wipe-right"
            ? x.rect(0, 0, W * e, H)
            : type === "wipe-left"
              ? x.rect(W * (1 - e), 0, W * e, H)
              : type === "wipe-down"
                ? x.rect(0, 0, W, H * e)
                : x.rect(0, H * (1 - e), W, H * e),
      });
      return;
    }
    case "doors":
      put(ctx, from);
      put(ctx, to, { clip: (x) => x.rect(W / 2 - (W / 2) * e, 0, W * e, H) });
      return;
    case "clock":
      put(ctx, from);
      put(ctx, to, {
        clip: (x) => {
          x.moveTo(W / 2, H / 2);
          x.arc(W / 2, H / 2, diag, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e);
          x.closePath();
        },
      });
      return;
    case "iris":
      put(ctx, from);
      put(ctx, to, { clip: (x) => x.arc(W / 2, H / 2, (diag / 2) * e, 0, Math.PI * 2) });
      return;
    case "diamond":
      put(ctx, from);
      put(ctx, to, {
        clip: (x) => {
          const r = diag * e;
          x.moveTo(W / 2, H / 2 - r);
          x.lineTo(W / 2 + r, H / 2);
          x.lineTo(W / 2, H / 2 + r);
          x.lineTo(W / 2 - r, H / 2);
          x.closePath();
        },
      });
      return;
    case "heart":
      put(ctx, from);
      put(ctx, to, { clip: (x) => heartPath(x, W / 2, H / 2, diag * 1.2 * e) });
      return;
    case "blinds": {
      put(ctx, from);
      const n = 8;
      put(ctx, to, {
        clip: (x) => {
          const bw = W / n;
          for (let i = 0; i < n; i++) x.rect(i * bw, 0, bw * e, H);
        },
      });
      return;
    }
    case "zoom-in":
      put(ctx, from, { s: 1 + e * 1.5, a: 1 - p });
      put(ctx, to, { s: 0.7 + 0.3 * e, a: p });
      return;
    case "zoom-out":
      put(ctx, from, { s: 1 - 0.4 * e, a: 1 - p });
      put(ctx, to, { s: 2 - e, a: p });
      return;
    case "spin":
      if (p < 0.5) put(ctx, from, { r: e * Math.PI, s: 1 - e * 0.8 });
      else put(ctx, to, { r: -(1 - e) * Math.PI, s: 0.2 + 0.8 * e });
      return;
    case "flash-zoom":
      if (p < 0.5) put(ctx, from, { s: 1 + e * 0.6 });
      else put(ctx, to, { s: 1.6 - 0.6 * e });
      fill(ctx, "#fff", Math.pow(Math.sin(p * Math.PI), 3));
      return;
    case "pixelate": {
      const size = 2 + Math.sin(p * Math.PI) * 60 * (H / 1080);
      const L = p < 0.5 ? from : to;
      put(ctx, processed(L, "tr-a", (c) => pixelate(c, size)));
      return;
    }
    case "glitch": {
      const L = p < 0.5 ? from : to;
      const amt = Math.sin(p * Math.PI) * 40 * (W / 1920);
      put(ctx, processed(L, "tr-a", (c) => rgbSplit(c, amt, amt / 4)), { x: (Math.sin(p * 90) * amt) / 2 });
      return;
    }
    default:
      put(ctx, from, { a: 1 - p });
      put(ctx, to, { a: p });
  }
}

// Directional geometric variants use the same compositor in preview and export.
const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
for (const family of ['slide', 'push', 'wipe', 'zoom'] as const) {
  // Cardinal slide/push/wipe variants render identically to the named presets, so only diagonals are listed (ids stay renderable for saved projects).
  DIRECTIONS.forEach((direction, i) => {
    if (family !== 'zoom' && i % 2 === 0) return;
    TRANSITIONS.push({ id: `vector-${family}-${i}`, name: `${family} ${direction}`, group: family === 'wipe' ? 'Wipe' : family === 'zoom' ? 'Camera' : 'Slide' });
  });
}
