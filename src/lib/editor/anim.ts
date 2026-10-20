import type { Clip } from "./types";

export interface AnimDef {
  id: string;
  name: string;
  textOnly?: boolean;
}

export const IN_ANIMS: AnimDef[] = [
  { id: "fade", name: "Fade in" },
  { id: "zoom-in", name: "Zoom in" },
  { id: "zoom-out", name: "Zoom out" },
  { id: "pop", name: "Pop" },
  { id: "bounce", name: "Bounce" },
  { id: "slide-left", name: "From right" },
  { id: "slide-right", name: "From left" },
  { id: "rise", name: "Rise" },
  { id: "drop", name: "Drop" },
  { id: "spin", name: "Spin in" },
  { id: "blur", name: "Blur in" },
  { id: "wipe", name: "Wipe in" },
  { id: "flicker", name: "Flicker" },
  { id: "typewriter", name: "Typewriter", textOnly: true },
];
export const OUT_ANIMS: AnimDef[] = [
  { id: "fade", name: "Fade out" },
  { id: "zoom-in", name: "Zoom in" },
  { id: "zoom-out", name: "Shrink" },
  { id: "pop", name: "Pop out" },
  { id: "slide-left", name: "To left" },
  { id: "slide-right", name: "To right" },
  { id: "rise", name: "Fly up" },
  { id: "drop", name: "Fall" },
  { id: "spin", name: "Spin out" },
  { id: "blur", name: "Blur out" },
  { id: "wipe", name: "Wipe out" },
  { id: "typewriter", name: "Erase", textOnly: true },
];
export const LOOP_ANIMS: AnimDef[] = [
  { id: "pulse", name: "Pulse" },
  { id: "wiggle", name: "Wiggle" },
  { id: "float", name: "Float" },
  { id: "swing", name: "Swing" },
  { id: "spin", name: "Rotate" },
  { id: "flicker", name: "Flicker" },
  { id: "heartbeat", name: "Heartbeat" },
  { id: "shake", name: "Shake" },
];

export interface AnimState {
  /** offsets in fractions of frame width / height */
  fx: number;
  fy: number;
  scale: number;
  rotation: number; // deg
  opacity: number;
  blur: number; // px at 1080p
  reveal: number; // 0..1 fraction of characters shown (text)
  wipe: number; // 0..1 fraction of width shown, from left
}

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const backOut = (p: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
const bounceOut = (x: number) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

/** p: 0 = hidden, 1 = fully shown. */
function applyEdge(s: AnimState, id: string, p: number, entering: boolean) {
  const q = 1 - easeOut(p);
  switch (id) {
    case "fade":
      s.opacity *= p;
      break;
    case "zoom-in":
      s.scale *= entering ? 0.3 + 0.7 * easeOut(p) : 1 + q * 1.5;
      s.opacity *= entering ? p : p;
      break;
    case "zoom-out":
      s.scale *= entering ? 1 + q * 1.5 : 0.3 + 0.7 * easeOut(p);
      s.opacity *= p;
      break;
    case "pop":
      s.scale *= Math.max(0, backOut(p));
      break;
    case "bounce":
      s.fy -= (1 - bounceOut(p)) * 0.5;
      break;
    case "slide-left":
      s.fx += (entering ? 1 : -1) * q * 0.6;
      s.opacity *= p;
      break;
    case "slide-right":
      s.fx += (entering ? -1 : 1) * q * 0.6;
      s.opacity *= p;
      break;
    case "rise":
      s.fy += (entering ? 1 : -1) * q * 0.3;
      s.opacity *= p;
      break;
    case "drop":
      s.fy += (entering ? -1 : 1) * q * 0.3;
      s.opacity *= p;
      break;
    case "spin":
      s.rotation += (entering ? -1 : 1) * q * 360;
      s.scale *= 0.2 + 0.8 * easeOut(p);
      break;
    case "blur":
      s.blur += q * 30;
      s.opacity *= p;
      break;
    case "wipe":
      s.wipe = Math.min(s.wipe, easeOut(p));
      break;
    case "flicker":
      s.opacity *= p >= 1 ? 1 : Math.floor(p * 12) % 2 === 0 ? 0.15 : 1;
      break;
    case "typewriter":
      s.reveal = Math.min(s.reveal, p);
      break;
  }
}

function applyLoop(s: AnimState, id: string, period: number, t: number) {
  const ph = (t / Math.max(0.1, period)) * Math.PI * 2;
  switch (id) {
    case "pulse":
      s.scale *= 1 + 0.08 * Math.sin(ph);
      break;
    case "wiggle":
      s.rotation += 6 * Math.sin(ph * 2);
      break;
    case "float":
      s.fy += 0.02 * Math.sin(ph);
      break;
    case "swing":
      s.rotation += 12 * Math.sin(ph);
      break;
    case "spin":
      s.rotation += (t / Math.max(0.1, period)) * 360;
      break;
    case "flicker":
      s.opacity *= 0.6 + 0.4 * (Math.sin(ph * 3) > -0.3 ? 1 : 0);
      break;
    case "heartbeat": {
      const k = (t % Math.max(0.1, period)) / period;
      s.scale *= 1 + (k < 0.15 ? Math.sin((k / 0.15) * Math.PI) * 0.12 : k < 0.3 ? Math.sin(((k - 0.15) / 0.15) * Math.PI) * 0.07 : 0);
      break;
    }
    case "shake":
      s.fx += 0.006 * Math.sin(ph * 7);
      s.fy += 0.006 * Math.cos(ph * 9);
      break;
  }
}

export function animState(c: Clip, local: number, d: number): AnimState {
  const s: AnimState = { fx: 0, fy: 0, scale: 1, rotation: 0, opacity: 1, blur: 0, reveal: 1, wipe: 1 };
  const a = c.anim;
  if (!a) return s;
  if (a.in && a.in.duration > 0 && local < a.in.duration) applyEdge(s, a.in.id, Math.max(0, local / a.in.duration), true);
  if (a.out && a.out.duration > 0 && local > d - a.out.duration)
    applyEdge(s, a.out.id, Math.max(0, (d - local) / a.out.duration), false);
  if (a.loop) applyLoop(s, a.loop.id, a.loop.duration, local);
  return s;
}
