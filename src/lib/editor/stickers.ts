import { GENERATED_STICKERS, drawGeneratedSticker } from "./sticker-gen";
import type { ShapeMotion, ShapeStyle } from './types';

export const ART_STICKERS = [
  ...GENERATED_STICKERS,
  { id: 'happy', name: 'Happy Face', group: 'Smileys', fill: '#ffd84b' },
  { id: 'love', name: 'Love Letter', group: 'Love', fill: '#ed4b83' },
  { id: 'rocket', name: 'Rocket', group: 'Party', fill: '#fa653b' },
  { id: 'flame', name: 'Flame', group: 'Nature', fill: '#ff702e' },
  { id: 'party', name: 'Party Popper', group: 'Party', fill: '#b06cef' },
  { id: 'camera', name: 'Camera', group: 'Symbols', fill: '#489fcb' },
  { id: 'music', name: 'Music Note', group: 'Music', fill: '#65bf98' },
  { id: 'lightning', name: 'Lightning', group: 'Weather', fill: '#ffdb49' },
  { id: 'pin', name: 'Location Pin', group: 'Symbols', fill: '#ef5872' },
  { id: 'check', name: 'Verified Check', group: 'Symbols', fill: '#4ebd8a' },
  { id: 'flower', name: 'Flower', group: 'Nature', fill: '#f582ba' },
  { id: 'cat', name: 'Curious Cat', group: 'Animal Meme', fill: '#e8a458' },
  { id: 'heart', name: 'Red Heart', group: 'Love', fill: '#ff3b5c' },
  { id: 'heart-eyes', name: 'Heart Eyes', group: 'Smileys', fill: '#ffd84b' },
  { id: 'broken-heart', name: 'Broken Heart', group: 'Love', fill: '#e0475f' },
  { id: 'cool', name: 'Cool Shades', group: 'Smileys', fill: '#ffd84b' },
  { id: 'laughing', name: 'LOL Face', group: 'Smileys', fill: '#ffcf3f' },
  { id: 'kiss', name: 'Kiss Face', group: 'Smileys', fill: '#ffb84d' },
  { id: 'surprised', name: 'Surprised Face', group: 'Smileys', fill: '#ffd84b' },
  { id: 'balloon', name: 'Balloon', group: 'Party', fill: '#ff5b7f' },
  { id: 'gift', name: 'Gift Box', group: 'Party', fill: '#ff9f43' },
  { id: 'crown', name: 'Crown', group: 'Symbols', fill: '#ffcf3f' },
  { id: 'sun', name: 'Sunny', group: 'Weather', fill: '#ffcf3f' },
  { id: 'moon', name: 'Crescent Moon', group: 'Weather', fill: '#ffe27a' },
  { id: 'rainbow', name: 'Rainbow', group: 'Weather', fill: '#ff5b5b' },
  { id: 'cloud', name: 'Cloud', group: 'Weather', fill: '#eaf2fb' },
  { id: 'snowflake', name: 'Snowflake', group: 'Weather', fill: '#8fd3ff' },
  { id: 'leaf', name: 'Leaf', group: 'Nature', fill: '#5bbf5b' },
  { id: 'mushroom', name: 'Mushroom', group: 'Nature', fill: '#e5533d' },
  { id: 'cactus', name: 'Cactus', group: 'Nature', fill: '#4fb783' },
  { id: 'butterfly', name: 'Butterfly', group: 'Nature', fill: '#8a6bf0' },
  { id: 'daisy', name: 'Daisy', group: 'Nature', fill: '#ffffff' },
  { id: 'fish', name: 'Fish', group: 'Nature', fill: '#ff8c42' },
  { id: 'paw', name: 'Paw Print', group: 'Animal Meme', fill: '#e8a458' },
  { id: 'pizza', name: 'Pizza Slice', group: 'Food', fill: '#ffb44d' },
  { id: 'donut', name: 'Donut', group: 'Food', fill: '#ff8fb1' },
  { id: 'ice-cream', name: 'Ice Cream', group: 'Food', fill: '#ffe08a' },
  { id: 'coffee', name: 'Coffee Cup', group: 'Food', fill: '#c98b5e' },
  { id: 'watermelon', name: 'Watermelon', group: 'Food', fill: '#ff5c6e' },
  { id: 'burger', name: 'Burger', group: 'Food', fill: '#e0a24b' },
  { id: 'cherry', name: 'Cherries', group: 'Food', fill: '#e23c5a' },
  { id: 'avocado', name: 'Avocado', group: 'Food', fill: '#7bbf4e' },
  { id: 'cupcake', name: 'Cupcake', group: 'Food', fill: '#ff9ec4' },
  { id: 'star', name: 'Star', group: 'Symbols', fill: '#ffcf3f' },
  { id: 'peace', name: 'Peace Sign', group: 'Symbols', fill: '#4ecdc4' },
  { id: 'skull', name: 'Skull', group: 'Symbols', fill: '#f4f1ea' },
  { id: 'gem', name: 'Gem', group: 'Symbols', fill: '#4dd0e1' },
  { id: 'speech', name: 'Speech Bubble', group: 'Symbols', fill: '#ffffff' },
  { id: 'target', name: 'Target', group: 'Symbols', fill: '#ff5b5b' },
  { id: 'headphones', name: 'Headphones', group: 'Music', fill: '#5b8def' },
  { id: 'mic', name: 'Microphone', group: 'Music', fill: '#9aa7bd' },
  // Film / camera (doc category C)
  { id: 'rec-dot', name: 'REC Indicator', group: 'Film', fill: '#ff3b3b' },
  { id: 'film-strip', name: 'Film Strip', group: 'Film', fill: '#1f1f23' },
  { id: 'timecode', name: 'Timecode', group: 'Film', fill: '#12161c' },
  { id: 'viewfinder', name: 'Viewfinder', group: 'Film', fill: '#ffffff' },
  { id: 'clapper', name: 'Clapperboard', group: 'Film', fill: '#20232b' },
  // Travel / vlog (doc category D)
  { id: 'airplane', name: 'Airplane', group: 'Travel', fill: '#d7e5f2' },
  { id: 'suitcase', name: 'Suitcase', group: 'Travel', fill: '#c98b5e' },
  { id: 'passport', name: 'Passport', group: 'Travel', fill: '#3b4f8a' },
  { id: 'ticket', name: 'Ticket', group: 'Travel', fill: '#ffcf6b' },
  { id: 'postcard', name: 'Postcard', group: 'Travel', fill: '#f6efe3' },
  { id: 'mountain', name: 'Mountain', group: 'Travel', fill: '#5c7fa8' },
  // Love / relationship (doc category E)
  { id: 'rose', name: 'Rose', group: 'Love', fill: '#e0365f' },
  { id: 'ring', name: 'Wedding Ring', group: 'Love', fill: '#e9c46a' },
  { id: 'cupid', name: 'Cupid Arrow', group: 'Love', fill: '#ff5b7f' },
  { id: 'love-lock', name: 'Love Lock', group: 'Love', fill: '#ff6b9d' },
  // Spiritual / devotional (doc category F)
  { id: 'diya', name: 'Diya Lamp', group: 'Spiritual', fill: '#d97b3a' },
  { id: 'lotus', name: 'Lotus', group: 'Spiritual', fill: '#f39ec1' },
  { id: 'om', name: 'Om Symbol', group: 'Spiritual', fill: '#ffb703' },
  { id: 'mandala', name: 'Mandala', group: 'Spiritual', fill: '#c8a2ff' },
  { id: 'incense', name: 'Incense', group: 'Spiritual', fill: '#a67c52' },
  // Gaming / streamer (doc category G)
  { id: 'controller', name: 'Game Controller', group: 'Gaming', fill: '#7c5cff' },
  { id: 'trophy', name: 'Trophy', group: 'Gaming', fill: '#ffcf3f' },
  { id: 'level-up', name: 'Level Up', group: 'Gaming', fill: '#4ade80' },
  { id: 'pixel-heart', name: 'Pixel Heart', group: 'Gaming', fill: '#ff4d6d' },
  { id: 'neon-bolt', name: 'Neon Bolt', group: 'Gaming', fill: '#22d3ee' },
  // Social / call-to-action (doc category I)
  { id: 'thumbs-up', name: 'Thumbs Up', group: 'Social', fill: '#3b82f6' },
  { id: 'bell', name: 'Notification Bell', group: 'Social', fill: '#f59e0b' },
  { id: 'play-btn', name: 'Play Button', group: 'Social', fill: '#ff0000' },
  { id: 'subscribe', name: 'Subscribe', group: 'Social', fill: '#ef4444' },
  { id: 'share', name: 'Share Node', group: 'Social', fill: '#22c55e' },
  // Comic / meme (doc category J)
  { id: 'boom', name: 'Boom Burst', group: 'Comic', fill: '#ffd166' },
  { id: 'pow', name: 'Pow Burst', group: 'Comic', fill: '#ef476f' },
  { id: 'comic-panel', name: 'Comic Panel', group: 'Comic', fill: '#ffffff' },
  { id: 'halftone', name: 'Halftone Dots', group: 'Comic', fill: '#111827' },
  // Labels / banners (doc category L)
  { id: 'new-badge', name: 'New Badge', group: 'Labels', fill: '#ff4757' },
  { id: 'sale-tag', name: 'Sale Tag', group: 'Labels', fill: '#ffd32a' },
  { id: 'breaking-news', name: 'Breaking News', group: 'Labels', fill: '#c0392b' },
  { id: 'lower-third', name: 'Lower Third', group: 'Labels', fill: '#1e293b' },
  { id: 'loading-bar', name: 'Loading Bar', group: 'Labels', fill: '#4f7cff' },
] as const;

/** Per-sticker motion profile. Applied inside drawSticker so every sticker animates on the timeline.
 *  - spin: constant rotation (rad / s)
 *  - pulse: fractional scale oscillation amplitude
 *  - pulseRate: oscillation speed (rad / s)
 *  - bounce: vertical bob amplitude (source units)
 *  - bounceRate: bob speed
 *  - wobble: rotation oscillation amplitude (rad)
 *  - wobbleRate: rotation oscillation speed
 *  - flicker: alpha modulation strength (0..1)
 *  - drift: horizontal sway amplitude
 *  - float: slow upward travel + reset cycle for particles/hearts (source units)
 */
type Motion = { spin?: number; pulse?: number; pulseRate?: number; bounce?: number; bounceRate?: number; wobble?: number; wobbleRate?: number; flicker?: number; drift?: number; float?: number };
const MOTION: Record<string, Motion> = {
  // Animated / emotive faces
  'happy': { wobble: 0.08, wobbleRate: 2.2, bounce: 4, bounceRate: 3 },
  'laughing': { wobble: 0.14, wobbleRate: 5 },
  'kiss': { pulse: 0.05, pulseRate: 3 },
  'cool': { bounce: 3, bounceRate: 2 },
  'surprised': { pulse: 0.08, pulseRate: 4 },
  'heart-eyes': { pulse: 0.07, pulseRate: 3.2 },
  // Love
  'heart': { pulse: 0.09, pulseRate: 3.5, float: 8 },
  'broken-heart': { wobble: 0.05, wobbleRate: 1.5 },
  'love': { bounce: 3, bounceRate: 2 },
  'rose': { wobble: 0.06, wobbleRate: 1.2 },
  'ring': { spin: 0.35 },
  'cupid': { drift: 4, bounce: 3, bounceRate: 2 },
  'love-lock': { wobble: 0.04, wobbleRate: 3 },
  // Weather / nature
  'sun': { spin: 0.4, pulse: 0.04, pulseRate: 2 },
  'moon': { wobble: 0.06, wobbleRate: 1 },
  'rainbow': { pulse: 0.03, pulseRate: 1.5 },
  'cloud': { drift: 6 },
  'snowflake': { spin: 0.9 },
  'leaf': { wobble: 0.15, wobbleRate: 1.5, drift: 4 },
  'flower': { spin: 0.25, pulse: 0.03, pulseRate: 2 },
  'butterfly': { bounce: 12, bounceRate: 3.5, drift: 8, wobble: 0.1, wobbleRate: 6 },
  'daisy': { spin: 0.2 },
  'fish': { drift: 10, wobble: 0.08, wobbleRate: 3 },
  'mushroom': { bounce: 3, bounceRate: 2 },
  'cactus': { wobble: 0.03, wobbleRate: 1 },
  // Fire / energy
  'flame': { flicker: 0.15, pulse: 0.08, pulseRate: 6 },
  'lightning': { flicker: 0.35, pulse: 0.05, pulseRate: 8 },
  // Party
  'balloon': { bounce: 10, bounceRate: 1.5, drift: 4 },
  'gift': { wobble: 0.06, wobbleRate: 3 },
  'party': { pulse: 0.06, pulseRate: 4 },
  'rocket': { bounce: 6, bounceRate: 4, wobble: 0.04, wobbleRate: 5 },
  // Symbols
  'star': { pulse: 0.1, pulseRate: 3, spin: 0.15 },
  'peace': { wobble: 0.05, wobbleRate: 1.2 },
  'skull': { wobble: 0.04, wobbleRate: 2 },
  'gem': { pulse: 0.06, pulseRate: 2, spin: 0.2 },
  'speech': { bounce: 4, bounceRate: 2.5 },
  'target': { pulse: 0.04, pulseRate: 2.5 },
  'crown': { pulse: 0.04, pulseRate: 1.8 },
  'check': { pulse: 0.1, pulseRate: 3.5 },
  // Music
  'music': { bounce: 6, bounceRate: 2.5, wobble: 0.1, wobbleRate: 3 },
  'headphones': { wobble: 0.05, wobbleRate: 2 },
  'mic': { bounce: 3, bounceRate: 3 },
  // Animal
  'cat': { wobble: 0.05, wobbleRate: 1.5, bounce: 3, bounceRate: 2 },
  'paw': { bounce: 5, bounceRate: 4 },
  // Food
  'pizza': { wobble: 0.04, wobbleRate: 2 },
  'donut': { spin: 0.3 },
  'ice-cream': { wobble: 0.05, wobbleRate: 1.5 },
  'coffee': { bounce: 3, bounceRate: 2, drift: 2 },
  'watermelon': { wobble: 0.05, wobbleRate: 1.8 },
  'burger': { bounce: 3, bounceRate: 1.5 },
  'cherry': { bounce: 5, bounceRate: 2.5 },
  'avocado': { wobble: 0.04, wobbleRate: 1.5 },
  'cupcake': { bounce: 3, bounceRate: 2 },
  // Film / camera
  'rec-dot': { flicker: 0.5, pulse: 0.08, pulseRate: 4 },
  'film-strip': { drift: 12 },
  'timecode': { flicker: 0.1 },
  'viewfinder': { pulse: 0.02, pulseRate: 2 },
  'clapper': { wobble: 0.06, wobbleRate: 2 },
  'camera': { wobble: 0.03, wobbleRate: 1.2 },
  // Travel
  'airplane': { drift: 12, bounce: 4, bounceRate: 1.5 },
  'suitcase': { wobble: 0.05, wobbleRate: 2 },
  'passport': { bounce: 3, bounceRate: 1.5 },
  'ticket': { wobble: 0.04, wobbleRate: 2 },
  'postcard': { wobble: 0.06, wobbleRate: 1.2 },
  'mountain': { pulse: 0.02, pulseRate: 1 },
  // Spiritual
  'diya': { flicker: 0.25, pulse: 0.05, pulseRate: 5 },
  'lotus': { pulse: 0.05, pulseRate: 1.2, spin: 0.1 },
  'om': { pulse: 0.07, pulseRate: 1.8 },
  'mandala': { spin: 0.35 },
  'incense': { drift: 3, wobble: 0.02, wobbleRate: 1 },
  // Gaming
  'controller': { wobble: 0.05, wobbleRate: 3 },
  'trophy': { pulse: 0.06, pulseRate: 2.5, bounce: 3, bounceRate: 3 },
  'level-up': { bounce: 8, bounceRate: 2.5 },
  'pixel-heart': { pulse: 0.1, pulseRate: 4 },
  'neon-bolt': { flicker: 0.3, pulse: 0.08, pulseRate: 6 },
  // Social
  'thumbs-up': { bounce: 5, bounceRate: 3, wobble: 0.06, wobbleRate: 3 },
  'bell': { wobble: 0.15, wobbleRate: 4.5 },
  'play-btn': { pulse: 0.08, pulseRate: 3 },
  'subscribe': { pulse: 0.06, pulseRate: 2.5 },
  'share': { bounce: 3, bounceRate: 2 },
  // Comic
  'boom': { pulse: 0.18, pulseRate: 6, spin: 0.25 },
  'pow': { pulse: 0.2, pulseRate: 7, spin: -0.3 },
  'comic-panel': { wobble: 0.03, wobbleRate: 2 },
  'halftone': { drift: 4 },
  // Labels
  'new-badge': { spin: 0.5, pulse: 0.05, pulseRate: 3 },
  'sale-tag': { wobble: 0.12, wobbleRate: 3 },
  'breaking-news': { flicker: 0.15, pulse: 0.03, pulseRate: 4 },
  'lower-third': { drift: 6 },
  'loading-bar': { drift: 8 },
};

/** Fallback motion for anything without an explicit entry (e.g. vector-* generated stickers). */
function defaultMotion(id: string): Motion | undefined {
  if (id.startsWith('vector-')) {
    const parts = id.split('-');
    const family = Number(parts[1] ?? 0) | 0;
    const variant = Number(parts[2] ?? 0) | 0;
    const spinFams = new Set([1, 4, 7, 8]); // Arrows, Shapes, Celebration, Icons
    if (spinFams.has(family)) return { spin: 0.2 + (variant % 6) * 0.08, pulse: 0.04, pulseRate: 2 + (variant % 4) * 0.5 };
    if (family === 3) return { wobble: 0.06, wobbleRate: 2 + (variant % 3) }; // Bubbles
    if (family === 6) return { drift: 5 + (variant % 4) * 2, bounce: 4, bounceRate: 1.5 + (variant % 3) }; // Weather
    return { pulse: 0.05 + (variant % 4) * 0.02, pulseRate: 2.5, wobble: 0.04, wobbleRate: 1.5 };
  }
  return { pulse: 0.04, pulseRate: 2, wobble: 0.03, wobbleRate: 1.5 };
}

/**
 * Looping motion styles offered in the inspector, on top of each artwork's built-in profile.
 * Every style is a pure function of clip-local time so preview, export and gallery
 * thumbnails animate identically. Translations are in artwork units (the artwork spans
 * roughly -100..100), scaled by `u` when the caller draws in canvas pixels.
 */
type MotionFn = (x: CanvasRenderingContext2D, t: number, a: number, u: number) => void;
const TAU = Math.PI * 2;

const MOTION_STYLES: Record<string, { name: string; fn: MotionFn }> = {
  bob: { name: "Bob", fn: (x, t, a, u) => { const y = Math.sin(t * 2.6); x.translate(0, -y * 10 * a * u); } },
  bounce: { name: "Bounce", fn: (x, t, a, u) => {
    // abs-sine hop with squash & stretch around the landing frame
    const ph = (t * 2.2) % Math.PI;
    const hop = Math.abs(Math.sin(ph));
    const near = Math.exp(-Math.pow((ph < Math.PI / 2 ? ph : Math.PI - ph) * 4, 2));
    const sy = 1 + (hop * 0.06 - near * 0.16) * a, sx = 1 - (hop * 0.06 - near * 0.16) * a * 0.7;
    x.translate(0, -hop * 22 * a * u); x.scale(sx, sy);
  } },
  swing: { name: "Swing", fn: (x, t, a) => { x.rotate(Math.sin(t * 1.8) * 0.28 * a); } },
  wiggle: { name: "Wiggle", fn: (x, t, a) => { x.rotate(Math.sin(t * 9) * 0.12 * a); x.translate(Math.sin(t * 9 + 1) * 2 * a, 0); } },
  spin: { name: "Spin", fn: (x, t, a) => { x.rotate(t * 1.6 * a); } },
  pulse: { name: "Pulse", fn: (x, t, a) => { const s = 1 + Math.sin(t * 3.4) * 0.12 * a; x.scale(s, s); } },
  heartbeat: { name: "Heartbeat", fn: (x, t, a) => {
    const k = ((t * 1.4) % 1 + 1) % 1;
    const thump = k < 0.16 ? Math.sin((k / 0.16) * Math.PI) : k < 0.34 ? Math.sin(((k - 0.16) / 0.18) * Math.PI) * 0.6 : 0;
    x.scale(1 + thump * 0.18 * a, 1 + thump * 0.18 * a);
  } },
  jelly: { name: "Jelly", fn: (x, t, a) => { const w = Math.sin(t * 5.2) * 0.14 * a; x.scale(1 + w, 1 - w); } },
  drift: { name: "Drift", fn: (x, t, a, u) => { x.translate(Math.sin(t * 1.1) * 16 * a * u, Math.cos(t * 0.7) * 5 * a * u); } },
  orbit: { name: "Orbit", fn: (x, t, a, u) => { x.translate(Math.cos(t * 1.9) * 14 * a * u, Math.sin(t * 1.9) * 14 * a * u); } },
  float: { name: "Float", fn: (x, t, a, u) => {
    // slow rise that fades out and restarts, for hearts/sparkle-style stickers
    const span = 4.5, k = (((t / span) % 1) + 1) % 1;
    x.translate(Math.sin(k * TAU * 1.5) * 8 * a * u, -k * 90 * a * u);
    x.globalAlpha = x.globalAlpha * Math.max(0.05, Math.sin(k * Math.PI) ** 0.6);
  } },
  shake: { name: "Shake", fn: (x, t, a, u) => { x.translate(Math.sin(t * 26) * 5 * a * u, Math.cos(t * 21) * 5 * a * u); } },
  blink: { name: "Blink", fn: (x, t, a) => { x.globalAlpha = x.globalAlpha * (1 - a * (0.5 + 0.5 * Math.sin(t * 12))); } },
  flash: { name: "Flash", fn: (x, t, a) => { x.globalAlpha = x.globalAlpha * (Math.floor(t * 4) % 2 === 0 ? 1 : 1 - 0.8 * a); } },
  pop: { name: "Pop", fn: (x, t, a) => {
    // repeatedly pops in with an overshoot, then holds
    const k = (((t / 2.4) % 1) + 1) % 1, c1 = 1.70158, c3 = c1 + 1;
    const back = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    const s = 1 - a * 0.55 + a * 0.55 * Math.max(0, back);
    x.scale(s, s);
  } },
  wave: { name: "Wave", fn: (x, t, a) => { x.transform(1, 0, Math.sin(t * 2.8) * 0.18 * a, 1, 0, 0); } },
  tilt: { name: "Tilt", fn: (x, t, a) => { x.rotate((t % 3) / 3 * TAU * 0.12 * a); x.scale(1 + Math.sin(t * 2) * 0.06 * a, 1 + Math.sin(t * 2) * 0.06 * a); } },
  gleam: { name: "Gleam", fn: (x, t, a) => { const s = 1 + Math.max(0, Math.sin(t * 1.6)) ** 6 * 0.22 * a; x.scale(s, s); x.globalAlpha = x.globalAlpha * (0.85 + 0.15 * Math.abs(Math.sin(t * 1.6))); } },
};

/** "Auto" keeps the artwork's own profile, "none" freezes it; both stay selectable in the UI. */
export const STICKER_MOTIONS: { id: string; name: string }[] = [
  { id: "auto", name: "Auto" },
  ...Object.keys(MOTION_STYLES).map((id) => ({ id, name: MOTION_STYLES[id]!.name })),
  { id: "none", name: "Still" },
];
export const MOTION_DEFAULT: ShapeMotion = { style: "auto", speed: 1, amount: 100 };

/** Plain shapes have no authored profile, so they get a looping style picked deterministically per shape. */
const SHAPE_MOTIONS = ["bob", "swing", "pulse", "jelly", "drift", "pop", "gleam", "tilt"];
export function defaultShapeMotion(type: string): ShapeMotion {
  if (type.startsWith("sticker:")) return { ...MOTION_DEFAULT };
  const h = [...type].reduce((n, c) => n + c.charCodeAt(0), 0) % SHAPE_MOTIONS.length;
  return { style: SHAPE_MOTIONS[h]!, speed: 1, amount: 100 };
}

const clampSpeed = (v: number | undefined) => Math.max(0.1, Math.min(4, v ?? 1));
const clampAmount = (v: number | undefined) => Math.max(0, Math.min(3, (v ?? 100) / 100));

function applyBuiltinMotion(x: CanvasRenderingContext2D, id: string, t: number, a: number, u: number) {
  const m = MOTION[id] ?? defaultMotion(id);
  if (!m) return;
  if (m.spin) x.rotate(m.spin * t * a);
  if (m.wobble) x.rotate(Math.sin(t * (m.wobbleRate ?? 2)) * m.wobble * a);
  const pulse = m.pulse ? 1 + Math.sin(t * (m.pulseRate ?? 3)) * m.pulse * a : 1;
  if (pulse !== 1) x.scale(pulse, pulse);
  // Bounce/drift are stored in normalized units; multiply to make them clearly visible at thumbnail and full-frame scales.
  const by = m.bounce ? Math.sin(t * (m.bounceRate ?? 2)) * m.bounce * 4 * a * u : 0;
  const dx = m.drift ? Math.sin(t * 0.9) * m.drift * 4 * a * u : 0;
  if (by || dx) x.translate(dx, -by);
  if (m.float) {
    const cycle = ((t * 30) % 120) * a;
    x.translate(0, -cycle * u);
    x.globalAlpha = Math.max(0.15, 1 - cycle / 120);
  }
  if (m.flicker) x.globalAlpha = Math.max(0.1, 1 - m.flicker * a * (0.5 + 0.5 * Math.sin(t * 20)));
}

/**
 * Animate a sticker/shape for clip-local time `t`.
 * `motion.style` picks a catalog style ("auto" = the artwork's own profile, "none" = still);
 * speed stretches time and amount scales every amplitude, so 0 freezes any artwork.
 * `u` converts artwork units into the current transform space (1 for stickers drawn in unit space).
 */
export function applyStickerMotion(
  x: CanvasRenderingContext2D,
  id: string,
  t: number,
  motion?: ShapeMotion | undefined,
  u = 1,
) {
  const amount = clampAmount(motion?.amount);
  if (amount <= 0 || motion?.style === "none") return;
  const time = t * clampSpeed(motion?.speed);
  const style = motion?.style && motion.style !== "auto" ? motion.style : "";
  const def = style ? MOTION_STYLES[style] : undefined;
  if (style && !def) return; // unknown id from an older project: stay still rather than guess
  if (def) def.fn(x, time, amount, u);
  else applyBuiltinMotion(x, id, time, amount, u);
}

export function drawSticker(x: CanvasRenderingContext2D, s: ShapeStyle, k: number, t = 0) {
  x.save(); x.scale(s.w * k / 200, s.h * k / 200);
  const __id = s.type.replace('sticker:', '');
  applyStickerMotion(x, __id, t, s.motion);
  const ink = s.strokeWidth > 0 ? s.stroke : '#20232b';
  x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = 5 + s.strokeWidth / 2;
  const poly = (pts: number[][], fill: string, stroke = '#ffffff') => {
    x.beginPath(); pts.forEach((p,i) => { const a=p[0] ?? 0,b=p[1] ?? 0; if(i)x.lineTo(a,b);else x.moveTo(a,b); }); x.closePath();x.fillStyle=fill;x.fill();x.strokeStyle=stroke;x.stroke();
  };
  const oval = (cx:number,cy:number,rx:number,ry:number,fill:string,stroke='#ffffff') => {x.beginPath();x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);x.fillStyle=fill;x.fill();x.strokeStyle=stroke;x.stroke();};
  const line = (pts:number[][],color:string,width=5) => {x.beginPath();pts.forEach((p,i)=>{if(i)x.lineTo(p[0]??0,p[1]??0);else x.moveTo(p[0]??0,p[1]??0);});x.strokeStyle=color;x.lineWidth=width;x.stroke();};
  const heart = (cx:number,cy:number,sz:number,fill:string) => {x.beginPath();x.moveTo(cx,cy+sz*0.35);x.bezierCurveTo(cx-sz*1.1,cy-sz*0.35,cx-sz*0.5,cy-sz*1.05,cx,cy-sz*0.45);x.bezierCurveTo(cx+sz*0.5,cy-sz*1.05,cx+sz*1.1,cy-sz*0.35,cx,cy+sz*0.35);x.fillStyle=fill;x.fill();x.strokeStyle='#ffffff';x.stroke();};
  const id = s.type.replace('sticker:', '');
  if (drawGeneratedSticker(x, id, s.fill, ink)) { x.restore(); return; }
  if (id === 'happy') {
    oval(0,0,78,78,s.fill); oval(-25,-15,7,12,ink,ink); oval(25,-15,7,12,ink,ink);
    x.beginPath();x.arc(0,5,42,0,Math.PI);x.fillStyle=ink;x.fill();oval(0,35,20,9,'#f27f91','#f27f91');
    oval(-48,15,12,7,'#f1a25a','#f1a25a');oval(48,15,12,7,'#f1a25a','#f1a25a');
  } else if (id === 'love') {
    poly([[-82,-45],[82,-45],[82,55],[-82,55]],'#fff3df');line([[-82,-45],[0,12],[82,-45]],s.fill);line([[-82,55],[-20,10]],s.fill);line([[82,55],[20,10]],s.fill);
    x.beginPath();x.moveTo(0,20);x.bezierCurveTo(-65,-22,-25,-65,0,-30);x.bezierCurveTo(25,-65,65,-22,0,20);x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();
  } else if(id==='rocket') {
    poly([[-24,45],[0,94],[25,45]],'#ffcd43');poly([[-24,10],[-64,63],[-23,53]],s.fill);poly([[24,10],[64,63],[23,53]],s.fill);
    x.beginPath();x.moveTo(0,-88);x.bezierCurveTo(48,-38,33,25,23,50);x.lineTo(-23,50);x.bezierCurveTo(-33,25,-48,-38,0,-88);x.fillStyle='#e9f3f8';x.fill();x.strokeStyle='#ffffff';x.stroke();
    oval(0,-18,20,20,'#45aecf',ink);poly([[-23,50],[23,50],[20,63],[-20,63]],s.fill);
  } else if(id==='flame') {
    x.beginPath();x.moveTo(0,-92);x.bezierCurveTo(-5,-20,-80,-40,-62,35);x.bezierCurveTo(-35,96,60,86,68,25);x.bezierCurveTo(70,-15,35,-40,34,-65);x.lineTo(10,-22);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();
    x.beginPath();x.moveTo(0,-8);x.bezierCurveTo(-38,30,-30,72,0,76);x.bezierCurveTo(42,70,38,30,0,-8);x.fillStyle='#ffe161';x.fill();
  } else if(id==='party') {
    poly([[-70,80],[-48,-10],[20,50]],s.fill);line([[-48,8],[0,51]],'#ffd84b',10);line([[-56,37],[-26,65]],'#f895ba',10);
    for(let i=0;i<8;i++){const a=i*1.7;const px=25+Math.cos(a)*55,py=-40+Math.sin(a)*40;poly([[px,py],[px+10,py-5],[px+16,py+6],[px+3,py+10]],i%2?'#ffc938':'#f473ab');}
    line([[0,12],[15,-15],[45,-20]],'#51c2cb');line([[-15,-8],[-10,-44],[8,-72]],s.fill);
  } else if(id==='camera') {
    poly([[-78,-38],[-30,-38],[-20,-58],[25,-58],[37,-38],[78,-38],[78,58],[-78,58]],s.fill);
    oval(0,10,41,41,ink);oval(0,10,28,28,'#67d2e0',ink);oval(-8,0,9,9,'#d6ffff','#d6ffff');poly([[48,-23],[64,-23],[64,-8],[48,-8]],'#ffd65d');
  } else if(id==='music') {
    poly([[-18,-60],[60,-80],[60,36],[43,36],[43,-40],[-1,-28],[-1,60],[-18,60]],s.fill);oval(-36,60,27,18,s.fill);oval(28,38,27,18,s.fill);
  } else if(id==='lightning') {
    poly([[10,-90],[-62,15],[-8,15],[-26,90],[65,-27],[15,-27],[36,-90]],s.fill);line([[0,-55],[-30,-4]],'#fff0a4',7);
  } else if(id==='pin') {
    x.beginPath();x.moveTo(0,88);x.bezierCurveTo(-15,50,-74,0,-60,-48);x.bezierCurveTo(-36,-104,36,-104,60,-48);x.bezierCurveTo(74,0,15,50,0,88);x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();oval(0,-35,25,25,'#ffffff');
  } else if(id==='check') {
    const points=Array.from({length:24},(_,i)=>{const a=i*Math.PI/12,r=i%2?66:80;return[Math.cos(a)*r,Math.sin(a)*r];});poly(points,s.fill);line([[-38,0],[-10,28],[43,-28]],'#ffffff',13);
  } else if(id==='flower') {
    for(let i=0;i<6;i++){x.save();x.rotate(i*Math.PI/3);oval(0,-45,26,40,s.fill);x.restore();}oval(0,0,27,27,'#ffe06a');oval(-8,-3,3,4,ink,ink);oval(8,-3,3,4,ink,ink);line([[-8,10],[0,15],[8,10]],ink,3);
  } else if(id==='cat') {
    poly([[-67,-22],[-66,-80],[-18,-48],[18,-48],[66,-80],[67,-22],[58,45],[0,68],[-58,45]],s.fill);
    poly([[-53,-58],[-52,-25],[-28,-41]],'#f4b4a5',s.fill);poly([[53,-58],[52,-25],[28,-41]],'#f4b4a5',s.fill);
    oval(-24,-6,7,11,ink,ink);oval(24,-6,7,11,ink,ink);poly([[-8,15],[8,15],[0,24]],'#ed8590',ink);line([[0,24],[0,32],[-13,38]],ink,3);line([[0,32],[13,38]],ink,3);
    line([[-40,19],[-80,10]],ink,3);line([[-40,29],[-80,35]],ink,3);line([[40,19],[80,10]],ink,3);line([[40,29],[80,35]],ink,3);
  } else if(id==='heart') {
    heart(0,6,172,s.fill);oval(-30,-26,15,20,'rgba(255,255,255,0.55)','rgba(255,255,255,0)');
  } else if(id==='heart-eyes') {
    oval(0,0,78,78,s.fill);heart(-30,-16,44,'#ff3b5c');heart(30,-16,44,'#ff3b5c');
    x.beginPath();x.arc(0,16,40,0.15*Math.PI,0.85*Math.PI);x.strokeStyle=ink;x.lineWidth=7;x.stroke();
  } else if(id==='broken-heart') {
    heart(0,6,172,s.fill);line([[-4,-64],[16,-16],[-16,26],[12,80]],'#ffffff',9);
  } else if(id==='cool') {
    oval(0,0,78,78,s.fill);x.fillStyle='#20232b';x.strokeStyle='#20232b';x.lineWidth=6;
    x.beginPath();x.roundRect(-62,-30,52,34,10);x.roundRect(10,-30,52,34,10);x.fill();x.stroke();
    line([[-10,-22],[10,-22]],'#20232b',6);line([[-62,-24],[-78,-32]],'#20232b',6);line([[62,-24],[78,-32]],'#20232b',6);
    x.beginPath();x.arc(0,18,30,0.1*Math.PI,0.9*Math.PI);x.strokeStyle=ink;x.lineWidth=6;x.stroke();
  } else if(id==='laughing') {
    oval(0,0,78,78,s.fill);line([[-46,-24],[-24,-36],[-2,-24]],ink,7);line([[2,-24],[24,-36],[46,-24]],ink,7);
    x.beginPath();x.moveTo(-40,10);x.quadraticCurveTo(0,68,40,10);x.closePath();x.fillStyle=ink;x.fill();
    x.beginPath();x.arc(0,28,15,0,Math.PI);x.fillStyle='#ff7d9c';x.fill();
  } else if(id==='kiss') {
    oval(0,0,78,78,s.fill);line([[-42,-22],[-18,-22]],ink,6);oval(28,-18,7,11,ink,ink);
    heart(12,34,58,'#ff3b5c');oval(-44,14,12,7,'#f1a25a','#f1a25a');
  } else if(id==='surprised') {
    oval(0,0,78,78,s.fill);oval(-26,-16,11,14,'#ffffff',ink);oval(26,-16,11,14,'#ffffff',ink);
    oval(-26,-14,5,6,ink,ink);oval(26,-14,5,6,ink,ink);oval(0,28,16,22,ink,ink);
  } else if(id==='balloon') {
    oval(0,-18,58,72,s.fill);poly([[-11,52],[11,52],[0,68]],s.fill);
    line([[0,68],[-12,84],[8,96],[-8,110]],'#c9d2e0',4);oval(-20,-40,13,20,'rgba(255,255,255,0.55)','rgba(255,255,255,0)');
  } else if(id==='gift') {
    poly([[-64,-16],[64,-16],[64,72],[-64,72]],s.fill);poly([[-74,-46],[74,-46],[74,-16],[-74,-16]],'#ffd25e');
    line([[0,-46],[0,72]],'#ffffff',14);oval(-24,-56,20,16,'#ff5b7f');oval(24,-56,20,16,'#ff5b7f');
  } else if(id==='crown') {
    poly([[-72,40],[-72,-30],[-38,-4],[0,-46],[38,-4],[72,-30],[72,40]],s.fill);poly([[-72,40],[72,40],[72,58],[-72,58]],'#e6b422');
    oval(0,-4,12,12,'#ff5b7f',ink);oval(-42,6,9,9,'#4dd0e1',ink);oval(42,6,9,9,'#4dd0e1',ink);
  } else if(id==='sun') {
    oval(0,0,52,52,s.fill);for(let i=0;i<8;i++){const a=i*Math.PI/4;line([[Math.cos(a)*66,Math.sin(a)*66],[Math.cos(a)*92,Math.sin(a)*92]],s.fill,10);}
  } else if(id==='moon') {
    oval(0,0,74,74,s.fill,'#ffe27a');x.save();x.globalCompositeOperation='destination-out';x.beginPath();x.ellipse(30,-14,66,66,0,0,Math.PI*2);x.fillStyle='#000';x.fill();x.restore();
  } else if(id==='rainbow') {
    const cols=['#ff5b5b','#ff9f43','#ffcf3f','#5bbf5b','#4d9de0','#9b6bd6'];for(let i=0;i<cols.length;i++){const c=cols[i]!;x.beginPath();x.strokeStyle=c;x.lineWidth=13;x.arc(0,44,92-i*13,Math.PI,2*Math.PI);x.stroke();}
    oval(-96,44,20,16,'#eaf2fb','#d7e3f0');oval(96,44,20,16,'#eaf2fb','#d7e3f0');
  } else if(id==='cloud') {
    poly([[-70,20],[70,20],[70,44],[-70,44]],s.fill,s.fill);oval(-40,12,34,30,s.fill,s.fill);oval(0,-6,44,38,s.fill,s.fill);oval(44,14,32,28,s.fill,s.fill);
    x.beginPath();x.moveTo(-72,24);x.arc(-40,12,34,Math.PI*0.6,Math.PI*1.5);x.arc(0,-6,44,Math.PI*1.1,Math.PI*1.9);x.arc(44,14,32,Math.PI*1.5,Math.PI*0.4);x.strokeStyle='#d7e3f0';x.lineWidth=5;x.stroke();
  } else if(id==='snowflake') {
    x.strokeStyle=s.fill;x.lineWidth=8;x.lineCap='round';for(let i=0;i<6;i++){const a=i*Math.PI/3;const ex=Math.cos(a)*80,ey=Math.sin(a)*80;x.beginPath();x.moveTo(0,0);x.lineTo(ex,ey);x.stroke();
      const bx=Math.cos(a)*54,by=Math.sin(a)*54,pa=a+Math.PI/3,pb=a-Math.PI/3;x.beginPath();x.moveTo(bx,by);x.lineTo(bx+Math.cos(pa)*22,by+Math.sin(pa)*22);x.moveTo(bx,by);x.lineTo(bx+Math.cos(pb)*22,by+Math.sin(pb)*22);x.stroke();}
  } else if(id==='leaf') {
    x.beginPath();x.moveTo(0,-84);x.bezierCurveTo(74,-40,60,54,0,84);x.bezierCurveTo(-60,54,-74,-40,0,-84);x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();
    line([[0,-70],[0,72]],'#2f7d3a',5);line([[0,-24],[32,-8]],'#2f7d3a',4);line([[0,14],[32,30]],'#2f7d3a',4);line([[0,-24],[-32,-8]],'#2f7d3a',4);line([[0,14],[-32,30]],'#2f7d3a',4);
  } else if(id==='mushroom') {
    poly([[-24,18],[24,18],[30,74],[-30,74]],'#f4e6c8','#e6d2a6');x.beginPath();x.moveTo(-78,22);x.bezierCurveTo(-72,-64,72,-64,78,22);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();
    oval(-34,-6,12,10,'#ffffff','#ffffff');oval(6,-20,13,11,'#ffffff','#ffffff');oval(42,-2,10,8,'#ffffff','#ffffff');
  } else if(id==='cactus') {
    x.beginPath();x.roundRect(-16,-72,32,112,16);x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();
    x.beginPath();x.roundRect(-60,-30,26,54,13);x.fill();x.stroke();x.beginPath();x.roundRect(34,-8,26,44,13);x.fill();x.stroke();
    poly([[-40,40],[40,40],[32,80],[-32,80]],'#d98b5a','#b96f43');
  } else if(id==='butterfly') {
    oval(-40,-24,36,30,s.fill);oval(-40,26,30,26,s.fill);oval(40,-24,36,30,s.fill);oval(40,26,30,26,s.fill);
    oval(-40,-24,12,10,'#ffd25e','#ffd25e');oval(40,-24,12,10,'#ffd25e','#ffd25e');poly([[-8,-42],[8,-42],[6,52],[-6,52]],'#5a4634',ink);
    line([[-4,-42],[-26,-74]],ink,4);line([[4,-42],[26,-74]],ink,4);
  } else if(id==='daisy') {
    for(let i=0;i<10;i++){x.save();x.rotate(i*Math.PI/5);oval(0,-52,15,40,'#ffffff','#e6ecf5');x.restore();}oval(0,0,26,26,'#ffcf3f','#f0a92a');
  } else if(id==='fish') {
    x.beginPath();x.moveTo(46,0);x.bezierCurveTo(16,-54,-56,-44,-68,0);x.bezierCurveTo(-56,44,16,54,46,0);x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();
    poly([[40,0],[88,-44],[88,44]],s.fill);oval(-46,-8,8,10,'#ffffff',ink);oval(-46,-8,4,5,ink,ink);x.beginPath();x.arc(-12,-4,20,-0.7,0.7);x.strokeStyle='#ffffff';x.lineWidth=5;x.stroke();
  } else if(id==='paw') {
    oval(0,26,44,34,s.fill);oval(-46,-12,17,22,s.fill);oval(-16,-32,17,24,s.fill);oval(16,-32,17,24,s.fill);oval(46,-12,17,22,s.fill);
  } else if(id==='pizza') {
    poly([[-6,-80],[-70,64],[58,64]],s.fill);poly([[-70,64],[58,64],[52,84],[-64,84]],'#e6b877','#c98b3f');
    oval(-18,6,10,10,'#d3492f','#d3492f');oval(14,30,9,9,'#d3492f','#d3492f');oval(-4,46,8,8,'#d3492f','#d3492f');oval(-28,-24,7,7,'#d3492f','#d3492f');
  } else if(id==='donut') {
    oval(0,0,80,80,'#e6b877');oval(0,-2,74,66,s.fill);x.save();x.globalCompositeOperation='destination-out';x.beginPath();x.ellipse(0,0,26,24,0,0,Math.PI*2);x.fillStyle='#000';x.fill();x.restore();
    const cols=['#4dd0e1','#ffcf3f','#8a6bf0','#5bbf5b'];for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=52;line([[Math.cos(a)*r-5,Math.sin(a)*r-5],[Math.cos(a)*r+5,Math.sin(a)*r+5]],cols[i%4]!,6);}
  } else if(id==='ice-cream') {
    poly([[-40,-2],[40,-2],[0,92]],'#e0a24b','#c98b3f');line([[-26,4],[6,60]],'#c98b3f',3);line([[-2,4],[-16,44]],'#c98b3f',3);
    x.beginPath();x.moveTo(-46,-4);x.bezierCurveTo(-54,-72,54,-72,46,-4);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();oval(-14,-38,18,16,'#ffffff',s.fill);
  } else if(id==='coffee') {
    poly([[-50,-16],[50,-16],[38,62],[-38,62]],'#ffffff','#d7e3f0');oval(0,-16,50,12,s.fill,'#a9724a');
    x.beginPath();x.arc(58,12,26,-Math.PI/2,Math.PI/2);x.strokeStyle='#c9d2e0';x.lineWidth=9;x.stroke();x.beginPath();x.moveTo(-30,-16);x.lineTo(30,-16);x.strokeStyle='#d7e3f0';x.lineWidth=4;x.stroke();
    line([[-16,-40],[-8,-58]],'#c9d2e0',4);line([[10,-40],[18,-58]],'#c9d2e0',4);
  } else if(id==='watermelon') {
    x.beginPath();x.arc(0,-42,86,0,Math.PI);x.closePath();x.fillStyle=s.fill;x.fill();x.lineWidth=15;x.strokeStyle='#5bbf5b';x.beginPath();x.arc(0,-42,86,0,Math.PI);x.stroke();
    x.lineWidth=6;x.strokeStyle='#ffffff';x.beginPath();x.arc(0,-42,72,0,Math.PI);x.stroke();
    oval(-32,4,4,7,'#2b2b2b','#2b2b2b');oval(0,10,4,7,'#2b2b2b','#2b2b2b');oval(32,4,4,7,'#2b2b2b','#2b2b2b');oval(-16,26,4,7,'#2b2b2b','#2b2b2b');oval(16,26,4,7,'#2b2b2b','#2b2b2b');
  } else if(id==='burger') {
    x.beginPath();x.moveTo(-72,-4);x.bezierCurveTo(-72,-64,72,-64,72,-4);x.closePath();x.fillStyle='#e6b877';x.fill();x.strokeStyle='#ffffff';x.stroke();
    oval(-20,-30,4,4,'#fff8e0','#fff8e0');oval(10,-38,4,4,'#fff8e0','#fff8e0');oval(34,-22,4,4,'#fff8e0','#fff8e0');
    poly([[-76,0],[76,0],[76,14],[-76,14]],'#7bbf4e','#5aa03a');poly([[-70,14],[70,14],[70,34],[-70,34]],'#8a4b2b','#6e3a20');
    x.beginPath();x.moveTo(-72,34);x.lineTo(72,34);x.bezierCurveTo(72,66,-72,66,-72,34);x.closePath();x.fillStyle='#e6b877';x.fill();x.stroke();
  } else if(id==='cherry') {
    line([[-30,20],[6,-62]],'#4f9b4f',5);line([[34,26],[6,-62]],'#4f9b4f',5);oval(-34,42,30,30,s.fill,'#c02b45');oval(38,48,28,28,s.fill,'#c02b45');
    oval(-44,32,8,10,'rgba(255,255,255,0.7)','rgba(255,255,255,0)');oval(8,-64,10,7,'#5bbf5b','#3f8f3f');
  } else if(id==='avocado') {
    x.beginPath();x.moveTo(0,-84);x.bezierCurveTo(56,-52,72,10,52,52);x.bezierCurveTo(30,88,-30,88,-52,52);x.bezierCurveTo(-72,10,-56,-52,0,-84);x.fillStyle='#3f6b2f';x.fill();x.strokeStyle='#ffffff';x.stroke();
    x.beginPath();x.moveTo(0,-64);x.bezierCurveTo(42,-38,54,8,38,42);x.bezierCurveTo(22,72,-22,72,-38,42);x.bezierCurveTo(-54,8,-42,-38,0,-64);x.fillStyle=s.fill;x.fill();oval(0,26,26,28,'#7a4a24','#5e3417');
  } else if(id==='cupcake') {
    poly([[-46,6],[46,6],[34,80],[-34,80]],'#c98b5e','#a9724a');line([[-22,10],[-16,78]],'#a9724a',4);line([[22,10],[16,78]],'#a9724a',4);
    x.beginPath();x.moveTo(-52,8);x.bezierCurveTo(-52,-46,52,-46,52,8);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();oval(0,-58,16,16,'#ff3b5c','#d3274a');
  } else if(id==='star') {
    const pts:number[][]=[];for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?36:84;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(pts,s.fill,'#e6b422');
  } else if(id==='peace') {
    x.beginPath();x.arc(0,0,80,0,Math.PI*2);x.strokeStyle=s.fill;x.lineWidth=14;x.stroke();line([[0,-80],[0,80]],s.fill,14);line([[0,0],[-56,56]],s.fill,14);line([[0,0],[56,56]],s.fill,14);
  } else if(id==='skull') {
    x.beginPath();x.moveTo(-64,10);x.bezierCurveTo(-70,-72,70,-72,64,10);x.bezierCurveTo(64,34,40,44,40,60);x.lineTo(-40,60);x.bezierCurveTo(-40,44,-64,34,-64,10);x.fillStyle=s.fill;x.fill();x.strokeStyle='#d8d2c4';x.stroke();
    oval(-28,-6,18,22,'#20232b','#20232b');oval(28,-6,18,22,'#20232b','#20232b');poly([[-8,22],[8,22],[0,38]],'#20232b','#20232b');
    line([[-24,60],[-24,46]],'#b8b0a0',4);line([[0,60],[0,46]],'#b8b0a0',4);line([[24,60],[24,46]],'#b8b0a0',4);
  } else if(id==='gem') {
    poly([[-72,-26],[-42,-58],[42,-58],[72,-26],[0,80]],s.fill,'#2ba6b8');line([[-72,-26],[72,-26]],'#2ba6b8',4);line([[-42,-58],[-24,-26]],'#ffffff',3);line([[42,-58],[24,-26]],'#ffffff',3);
    line([[-24,-26],[0,80]],'#2ba6b8',3);line([[24,-26],[0,80]],'#2ba6b8',3);line([[-72,-26],[0,80]],'#ffffff',3);line([[72,-26],[0,80]],'#ffffff',3);
  } else if(id==='speech') {
    x.beginPath();x.roundRect(-82,-64,164,108,20);x.fillStyle=s.fill;x.fill();x.strokeStyle='#d7e3f0';x.stroke();poly([[-30,42],[-6,42],[-26,78]],s.fill,'#d7e3f0');
    oval(-40,-10,8,8,'#8fa3bd','#8fa3bd');oval(0,-10,8,8,'#8fa3bd','#8fa3bd');oval(40,-10,8,8,'#8fa3bd','#8fa3bd');
  } else if(id==='target') {
    oval(0,0,84,84,'#ff5b5b','#ffffff');oval(0,0,58,58,'#ffffff','#ffffff');oval(0,0,32,32,'#ff5b5b','#ff5b5b');oval(0,0,12,12,'#20232b','#20232b');
  } else if(id==='headphones') {
    x.beginPath();x.arc(0,-4,66,Math.PI,2*Math.PI);x.strokeStyle=s.fill;x.lineWidth=16;x.stroke();
    x.beginPath();x.roundRect(-84,-8,34,58,12);x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();x.beginPath();x.roundRect(50,-8,34,58,12);x.fill();x.stroke();
  } else if(id==='mic') {
    x.beginPath();x.roundRect(-30,-84,60,110,28);x.fillStyle=s.fill;x.fill();x.strokeStyle='#ffffff';x.stroke();
    for(let r=0;r<3;r++)for(let c=0;c<3;c++)oval(-16+c*16,-64+r*16,3,3,'#5a6577','#5a6577');
    x.beginPath();x.arc(0,-16,50,0.1*Math.PI,0.9*Math.PI);x.strokeStyle=ink;x.lineWidth=8;x.stroke();line([[0,26],[0,58]],ink,8);line([[-30,58],[30,58]],ink,8);
  } else if(id==='rec-dot') {
    oval(-56,0,20,20,s.fill,s.fill);
    x.fillStyle='#ffffff';x.font='bold 42px system-ui';x.textAlign='left';x.textBaseline='middle';x.fillText('REC',-24,2);
  } else if(id==='film-strip') {
    x.fillStyle=s.fill;x.fillRect(-88,-60,176,120);x.strokeStyle='#ffffff';x.lineWidth=4;x.strokeRect(-88,-60,176,120);
    x.fillStyle='#ffffff';for(let i=0;i<6;i++){x.fillRect(-80+i*30,-52,16,10);x.fillRect(-80+i*30,42,16,10);}
    x.fillStyle='#4a4a55';for(let i=0;i<3;i++)x.fillRect(-70+i*50,-30,40,60);
  } else if(id==='timecode') {
    x.fillStyle=s.fill;x.beginPath();x.roundRect(-88,-40,176,80,10);x.fill();
    x.fillStyle='#ff5b5b';x.font='bold 40px ui-monospace, monospace';x.textAlign='center';x.textBaseline='middle';x.fillText('00\u2009:00\u2009:12',0,2);
  } else if(id==='viewfinder') {
    x.strokeStyle=s.fill;x.lineWidth=10;x.lineCap='round';
    const L=36;[[-80,-80,1,1],[80,-80,-1,1],[-80,80,1,-1],[80,80,-1,-1]].forEach(([px,py,sx,sy])=>{x.beginPath();x.moveTo(px!,(py!+L*(sy??1)));x.lineTo(px!,py!);x.lineTo((px!+L*(sx??1)),py!);x.stroke();});
    x.beginPath();x.arc(0,0,10,0,Math.PI*2);x.stroke();
  } else if(id==='clapper') {
    poly([[-82,-10],[82,-10],[82,70],[-82,70]],s.fill,'#ffffff');
    x.save();x.translate(0,-30);x.rotate(-0.06);for(let i=0;i<6;i++){poly([[-82+i*30,-16],[-52+i*30,-16],[-62+i*30,16],[-92+i*30,16]],i%2?'#ffffff':'#20232b','#000000');}x.restore();
  } else if(id==='airplane') {
    poly([[-70,20],[40,20],[75,0],[40,-20],[-70,-20],[-40,0]],s.fill,'#8fa3bd');
    poly([[-10,-20],[15,-70],[35,-70],[25,-20]],'#8fa3bd','#5a6577');poly([[-10,20],[15,70],[35,70],[25,20]],'#8fa3bd','#5a6577');
    oval(50,-4,6,6,'#4b5b75','#4b5b75');
  } else if(id==='suitcase') {
    x.beginPath();x.roundRect(-70,-40,140,110,14);x.fillStyle=s.fill;x.fill();x.strokeStyle='#8a5a3a';x.lineWidth=5;x.stroke();
    x.beginPath();x.roundRect(-26,-64,52,26,10);x.strokeStyle='#8a5a3a';x.lineWidth=8;x.stroke();
    line([[-70,10],[70,10]],'#8a5a3a',5);
    x.fillStyle='#e6c79a';x.fillRect(-16,-30,32,20);x.fillRect(-16,30,32,20);
  } else if(id==='passport') {
    x.beginPath();x.roundRect(-60,-80,120,160,8);x.fillStyle=s.fill;x.fill();x.strokeStyle='#1a2a5c';x.stroke();
    oval(0,-20,26,26,'#e8d9a0','#e8d9a0');
    x.fillStyle='#e8d9a0';x.font='bold 16px system-ui';x.textAlign='center';x.fillText('PASSPORT',0,42);
    line([[-40,60],[40,60]],'#e8d9a0',3);
  } else if(id==='ticket') {
    x.beginPath();x.moveTo(-84,-40);x.lineTo(64,-40);x.bezierCurveTo(88,-40,88,40,64,40);x.lineTo(-84,40);x.bezierCurveTo(-64,40,-64,-40,-84,-40);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#8a6a1e';x.stroke();
    x.setLineDash([6,6]);x.strokeStyle='#8a6a1e';x.lineWidth=3;x.beginPath();x.moveTo(30,-36);x.lineTo(30,36);x.stroke();x.setLineDash([]);
    x.fillStyle='#3a2a10';x.font='bold 20px system-ui';x.textAlign='center';x.fillText('ADMIT',-20,-4);x.fillText('ONE',-20,18);
  } else if(id==='postcard') {
    x.beginPath();x.rect(-88,-60,176,120);x.fillStyle=s.fill;x.fill();x.strokeStyle='#a89a80';x.lineWidth=4;x.stroke();
    x.fillStyle='#5c9ed6';x.fillRect(42,-50,38,32);x.strokeStyle='#a89a80';x.strokeRect(42,-50,38,32);
    line([[-78,-14],[22,-14]],'#c9b89a',3);line([[-78,4],[22,4]],'#c9b89a',3);line([[-78,22],[22,22]],'#c9b89a',3);
    poly([[-70,32],[-30,-2],[10,32]],'#8fbb6a','#5a8a4a');
  } else if(id==='mountain') {
    poly([[-88,50],[-20,-50],[30,10],[60,-30],[88,50]],s.fill,'#3a5478');
    poly([[-20,-50],[-8,-24],[-32,-24]],'#ffffff','#d7e5f2');poly([[60,-30],[70,-10],[50,-10]],'#ffffff','#d7e5f2');
    oval(58,-58,14,14,'#ffcf3f','#e6b422');
  } else if(id==='rose') {
    poly([[-8,-30],[8,-30],[16,72],[-16,72]],'#4a8b3f','#2f6a2a');
    line([[0,-30],[0,60]],'#2f6a2a',3);
    poly([[22,10],[62,4],[42,32]],'#4a8b3f','#2f6a2a');poly([[-22,26],[-62,20],[-42,48]],'#4a8b3f','#2f6a2a');
    oval(0,-44,32,32,s.fill,'#8a1e38');
    x.beginPath();x.arc(0,-44,22,Math.PI,2*Math.PI);x.strokeStyle='#8a1e38';x.lineWidth=4;x.stroke();
    x.beginPath();x.arc(-10,-50,14,0,Math.PI*2);x.strokeStyle='#8a1e38';x.lineWidth=3;x.stroke();
    x.beginPath();x.arc(12,-38,12,0,Math.PI*2);x.stroke();
  } else if(id==='ring') {
    x.strokeStyle='#a08a5c';x.lineWidth=10;x.beginPath();x.arc(0,20,42,0,Math.PI*2);x.stroke();
    x.strokeStyle=s.fill;x.lineWidth=6;x.beginPath();x.arc(0,20,42,0,Math.PI*2);x.stroke();
    poly([[-22,-30],[22,-30],[0,-8]],s.fill,'#8a6a1e');poly([[-22,-30],[-10,-56],[10,-56],[22,-30]],'#e8f4ff','#a0c4e0');
    line([[-10,-56],[0,-30],[10,-56]],'#a0c4e0',2);
  } else if(id==='cupid') {
    line([[-70,60],[70,-60]],'#5a4634',6);
    poly([[70,-60],[46,-56],[60,-40],[78,-42]],s.fill,'#8a1e38');
    poly([[-70,60],[-70,42],[-52,54]],s.fill,'#8a1e38');poly([[-70,60],[-88,60],[-78,42]],s.fill,'#8a1e38');
    x.beginPath();x.arc(-40,-40,42,Math.PI*0.15,Math.PI*0.85);x.strokeStyle='#8a4b2b';x.lineWidth=6;x.stroke();
    heart(-30,-30,32,'#ff3b5c');
  } else if(id==='love-lock') {
    x.beginPath();x.arc(0,-30,32,Math.PI,2*Math.PI);x.strokeStyle='#a8a8b8';x.lineWidth=10;x.stroke();
    x.beginPath();x.roundRect(-52,-8,104,80,12);x.fillStyle=s.fill;x.fill();x.strokeStyle='#a03a5c';x.stroke();
    heart(0,26,42,'#ffffff');
  } else if(id==='diya') {
    x.beginPath();x.moveTo(-70,20);x.bezierCurveTo(-70,72,70,72,70,20);x.lineTo(-70,20);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#8a4a1e';x.stroke();
    poly([[-70,20],[70,20],[58,10],[-58,10]],'#f3c07a','#8a4a1e');
    x.beginPath();x.moveTo(0,-12);x.bezierCurveTo(-16,-38,-14,-62,0,-80);x.bezierCurveTo(14,-62,16,-38,0,-12);x.fillStyle='#ff9d3a';x.fill();x.strokeStyle='#ffd166';x.stroke();
    x.beginPath();x.moveTo(0,-24);x.bezierCurveTo(-8,-40,-6,-56,0,-68);x.bezierCurveTo(6,-56,8,-40,0,-24);x.fillStyle='#fff27a';x.fill();
  } else if(id==='lotus') {
    for(let i=0;i<6;i++){x.save();x.rotate(i*Math.PI/3);oval(0,-38,14,34,s.fill,'#c47fa8');x.restore();}
    for(let i=0;i<5;i++){x.save();x.rotate(i*Math.PI/2.5+0.3);oval(0,-24,12,24,'#ffd0e2','#c47fa8');x.restore();}
    oval(0,0,14,14,'#ffcf3f','#e6b422');
  } else if(id==='om') {
    x.strokeStyle=s.fill;x.lineWidth=12;x.lineCap='round';
    x.beginPath();x.arc(-24,10,24,0.15*Math.PI,1.85*Math.PI);x.stroke();
    x.beginPath();x.arc(20,-6,22,0.5*Math.PI,2.1*Math.PI);x.stroke();
    x.beginPath();x.moveTo(-4,30);x.quadraticCurveTo(24,42,42,26);x.stroke();
    oval(14,-52,10,10,s.fill,s.fill);
    x.beginPath();x.arc(28,-64,16,Math.PI*1.15,Math.PI*1.85);x.stroke();
  } else if(id==='mandala') {
    x.strokeStyle=s.fill;x.lineWidth=4;
    for(let r=1;r<=4;r++){x.beginPath();x.arc(0,0,r*20,0,Math.PI*2);x.stroke();}
    for(let i=0;i<12;i++){x.save();x.rotate(i*Math.PI/6);x.beginPath();x.moveTo(0,-20);x.lineTo(0,-80);x.stroke();oval(0,-30,4,6,s.fill,s.fill);oval(0,-50,5,7,s.fill,s.fill);oval(0,-70,6,8,s.fill,s.fill);x.restore();}
    oval(0,0,10,10,s.fill,'#8a4fb0');
  } else if(id==='incense') {
    poly([[-4,10],[4,10],[4,80],[-4,80]],s.fill,'#5a4634');
    poly([[-40,80],[40,80],[24,96],[-24,96]],'#c9b89a','#8a6a3a');
    x.strokeStyle='rgba(220,220,230,0.9)';x.lineWidth=5;x.beginPath();x.moveTo(0,10);x.bezierCurveTo(20,-20,-20,-40,10,-70);x.stroke();
    x.strokeStyle='rgba(200,200,215,0.7)';x.beginPath();x.moveTo(0,10);x.bezierCurveTo(-18,-16,22,-42,-8,-72);x.stroke();
    oval(0,4,4,4,'#ff5b3b','#ff9d3a');
  } else if(id==='controller') {
    x.beginPath();x.moveTo(-70,-30);x.bezierCurveTo(-90,-30,-90,40,-60,50);x.lineTo(-30,50);x.lineTo(30,50);x.lineTo(60,50);x.bezierCurveTo(90,40,90,-30,70,-30);x.lineTo(-70,-30);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#3a2a6a';x.stroke();
    x.fillStyle='#20232b';x.fillRect(-52,-6,30,8);x.fillRect(-37,-21,8,30);
    oval(30,-10,8,8,'#ff5b5b','#ff5b5b');oval(48,6,8,8,'#4dd0e1','#4dd0e1');oval(30,20,8,8,'#ffcf3f','#ffcf3f');oval(14,6,8,8,'#5bbf5b','#5bbf5b');
    oval(-6,-16,10,6,'#3a2a6a','#3a2a6a');
  } else if(id==='trophy') {
    poly([[-40,-60],[40,-60],[32,-6],[-32,-6]],s.fill,'#b8891a');
    x.beginPath();x.arc(-42,-40,20,Math.PI*0.5,Math.PI*1.5);x.strokeStyle='#b8891a';x.lineWidth=6;x.stroke();
    x.beginPath();x.arc(42,-40,20,-Math.PI*0.5,Math.PI*0.5);x.stroke();
    poly([[-14,-6],[14,-6],[18,26],[-18,26]],'#e6b422','#b8891a');
    poly([[-34,26],[34,26],[38,46],[-38,46]],'#b8891a','#7a5a10');
    oval(0,-30,10,10,'#fff8c2','#b8891a');
  } else if(id==='level-up') {
    poly([[0,-80],[50,-16],[24,-16],[24,50],[-24,50],[-24,-16],[-50,-16]],s.fill,'#1e7a3c');
    x.fillStyle='#ffffff';x.font='bold 22px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('LVL UP',0,26);
    for(let i=0;i<3;i++){const px=-58+i*58,py=-56+((i%2)*14);const pts=[[px,py-8],[px+3,py-3],[px+8,py],[px+3,py+3],[px,py+8],[px-3,py+3],[px-8,py],[px-3,py-3]];poly(pts,'#ffcf3f','#e6b422');}
  } else if(id==='pixel-heart') {
    x.fillStyle=s.fill;x.strokeStyle='#8a1e38';x.lineWidth=2;
    const px=16,map=[[0,1,1,0,1,1,0],[1,1,1,1,1,1,1],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]];
    for(let r=0;r<map.length;r++)for(let c=0;c<map[r]!.length;c++)if(map[r]![c]){const rx=(c-3)*px,ry=(r-3)*px;x.fillRect(rx,ry,px,px);x.strokeRect(rx,ry,px,px);}
  } else if(id==='neon-bolt') {
    x.shadowColor=s.fill;x.shadowBlur=14;
    poly([[10,-90],[-62,15],[-8,15],[-26,90],[65,-27],[15,-27],[36,-90]],s.fill,'#e0faff');
    x.shadowBlur=0;
  } else if(id==='thumbs-up') {
    x.beginPath();x.roundRect(-70,10,32,64,6);x.fillStyle=s.fill;x.fill();x.strokeStyle='#1e3a8a';x.stroke();
    x.beginPath();x.moveTo(-38,74);x.lineTo(-38,20);x.bezierCurveTo(-38,10,-24,4,-8,4);x.lineTo(6,-30);x.bezierCurveTo(20,-58,46,-40,42,-16);x.lineTo(38,10);x.lineTo(70,10);x.bezierCurveTo(84,10,84,74,66,74);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#1e3a8a';x.stroke();
  } else if(id==='bell') {
    x.beginPath();x.moveTo(-56,40);x.bezierCurveTo(-56,-30,-30,-60,0,-60);x.bezierCurveTo(30,-60,56,-30,56,40);x.lineTo(-56,40);x.closePath();x.fillStyle=s.fill;x.fill();x.strokeStyle='#8a5a10';x.stroke();
    line([[-70,44],[70,44]],'#8a5a10',10);
    x.beginPath();x.arc(0,58,14,0,Math.PI);x.fillStyle='#8a5a10';x.fill();
    oval(0,-64,7,7,'#8a5a10','#8a5a10');
  } else if(id==='play-btn') {
    x.beginPath();x.roundRect(-84,-58,168,116,20);x.fillStyle=s.fill;x.fill();x.strokeStyle='#8a1a1a';x.stroke();
    poly([[10,-30],[10,30],[-24,0]],'#ffffff','#ffffff');
  } else if(id==='subscribe') {
    x.beginPath();x.roundRect(-84,-32,168,64,12);x.fillStyle=s.fill;x.fill();x.strokeStyle='#7a1a1a';x.stroke();
    poly([[-40,-12],[-40,12],[-24,0]],'#ffffff','#ffffff');
    x.fillStyle='#ffffff';x.font='bold 22px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('SUBSCRIBE',18,2);
  } else if(id==='share') {
    oval(58,-42,18,18,s.fill,'#1a5a2c');oval(58,42,18,18,s.fill,'#1a5a2c');oval(-52,0,18,18,s.fill,'#1a5a2c');
    x.strokeStyle=s.fill;x.lineWidth=6;
    line([[-40,-6],[46,-36]],'#1a5a2c',6);line([[-40,6],[46,36]],'#1a5a2c',6);
    line([[-40,-6],[46,-36]],s.fill,4);line([[-40,6],[46,36]],s.fill,4);
  } else if(id==='boom') {
    const pts:number[][]=[];for(let i=0;i<16;i++){const a=i*Math.PI/8-Math.PI/2,r=i%2?44:88;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(pts,s.fill,'#8a5a10');
    x.fillStyle='#8a1e38';x.font='bold 34px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('BOOM',0,2);
  } else if(id==='pow') {
    const pts:number[][]=[];for(let i=0;i<20;i++){const a=i*Math.PI/10-Math.PI/2,r=i%2?36:86;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(pts,s.fill,'#7a1a3c');
    x.fillStyle='#ffffff';x.font='bold 30px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('POW',0,2);
  } else if(id==='comic-panel') {
    x.beginPath();x.rect(-84,-64,168,128);x.fillStyle=s.fill;x.fill();x.strokeStyle='#111827';x.lineWidth=8;x.stroke();
    x.fillStyle='#111827';x.font='bold 24px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('...',0,10);
    x.beginPath();x.moveTo(-40,-30);x.bezierCurveTo(-30,-50,-10,-50,0,-30);x.bezierCurveTo(-10,-42,-30,-42,-40,-30);x.fill();
  } else if(id==='halftone') {
    x.fillStyle=s.fill;for(let r=0;r<6;r++)for(let c=0;c<8;c++){const rad=2+(5-r)*1.4+((7-c))*0.4;x.beginPath();x.arc(-70+c*20,-50+r*20,rad,0,Math.PI*2);x.fill();}
    x.strokeStyle='#ef476f';x.lineWidth=4;x.strokeRect(-84,-64,168,128);
  } else if(id==='new-badge') {
    const pts:number[][]=[];for(let i=0;i<24;i++){const a=i*Math.PI/12,r=i%2?54:80;pts.push([Math.cos(a)*r,Math.sin(a)*r]);}poly(pts,s.fill,'#8a1a1a');
    x.fillStyle='#ffffff';x.font='bold 34px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('NEW',0,4);
  } else if(id==='sale-tag') {
    x.save();x.rotate(-0.15);
    poly([[-70,-40],[50,-40],[70,0],[50,40],[-70,40]],s.fill,'#8a6a10');
    oval(52,0,7,7,'#ffffff','#8a6a10');
    x.fillStyle='#8a1e38';x.font='bold 28px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('SALE',-12,2);
    x.restore();
  } else if(id==='breaking-news') {
    poly([[-88,-30],[88,-30],[88,30],[-88,30]],s.fill,'#7a1a10');
    x.fillStyle='#ffffff';x.font='bold 22px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('BREAKING NEWS',0,2);
    poly([[-88,30],[88,30],[88,50],[-88,50]],'#ffd32a','#8a6a10');
  } else if(id==='lower-third') {
    poly([[-88,-14],[-70,-14],[-70,14],[-88,14]],s.fill,'#0f172a');
    poly([[-66,-14],[88,-14],[88,14],[-66,14]],'#334155','#0f172a');
    x.fillStyle='#ffffff';x.font='bold 14px system-ui';x.textAlign='left';x.textBaseline='middle';x.fillText('NAME • TITLE',-56,2);
  } else if(id==='loading-bar') {
    x.beginPath();x.roundRect(-84,-14,168,28,14);x.fillStyle='#e5e7eb';x.fill();x.strokeStyle='#374151';x.lineWidth=3;x.stroke();
    x.save();x.beginPath();x.roundRect(-84,-14,110,28,14);x.fillStyle=s.fill;x.fill();x.restore();
    x.fillStyle='#ffffff';x.font='bold 12px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText('LOADING',-30,2);
  }
  x.restore();
}