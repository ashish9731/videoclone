import { EDITOR_FONTS } from "./fonts";
import { type Clip, type SpeedPoint, type TextStyle, STILL_SOURCE_DURATION, TEXT_DEFAULT_DURATION, defaultEffects, defaultTransform, textClip, uid } from "./types";

export interface TextTemplate {
  id: string;
  name: string;
  hint: string;
  style: Partial<TextStyle>;
  anim?: Clip["anim"];
  y?: number; // fraction of height offset from center
  x?: number;
}

export const TEXT_TEMPLATES: TextTemplate[] = [
  { id: "title", name: "TITLE", hint: "Big headline, pops in", style: { content: "TITLE", fontFamily: "Bebas Neue", fontSize: 160 }, anim: { in: { id: "pop", duration: 0.5 }, out: { id: "fade", duration: 0.4 } } },
  { id: "neon", name: "Neon", hint: "Glowing, flickers on", style: { content: "NEON NIGHTS", fontFamily: "Sora", fontSize: 110, color: "#ff4fd8", glowColor: "#ff4fd8", glowSize: 30 }, anim: { in: { id: "flicker", duration: 0.8 }, loop: { id: "flicker", duration: 2 } } },
  { id: "typewriter", name: "Typewriter", hint: "Types itself out", style: { content: "Once upon a time…", fontFamily: "JetBrains Mono", fontSize: 72, bold: false }, anim: { in: { id: "typewriter", duration: 1.6 }, out: { id: "typewriter", duration: 0.8 } } },
  { id: "subtitle", name: "Subtitle", hint: "Clean lower text, rises", style: { content: "Subtitle text", fontSize: 64, bold: false }, y: 0.3, anim: { in: { id: "rise", duration: 0.4 }, out: { id: "fade", duration: 0.3 } } },
  { id: "lower", name: "Lower third", hint: "Name tag, slides in", style: { content: "Name Surname\nRole", fontSize: 52, background: "rgba(0,0,0,0.7)", align: "left" }, x: -0.25, y: 0.32, anim: { in: { id: "slide-right", duration: 0.5 }, out: { id: "slide-right", duration: 0.4 } } },
  { id: "bold-pop", name: "BOLD POP", hint: "Yellow, outlined, bounces", style: { content: "WOW!", fontFamily: "Bebas Neue", fontSize: 200, color: "#ffd400", stroke: "#000000", strokeWidth: 10 }, anim: { in: { id: "bounce", duration: 0.7 }, loop: { id: "pulse", duration: 1 } } },
  { id: "cinema", name: "Cinematic", hint: "Wide spaced serif, slow fade", style: { content: "THE JOURNEY", fontFamily: "Playfair Display", fontSize: 96, bold: false, letterSpacing: 24 }, anim: { in: { id: "blur", duration: 1.5 }, out: { id: "blur", duration: 1 } } },
  { id: "label", name: "Label", hint: "Orange tag, wipes in", style: { content: "NEW VIDEO", fontFamily: "Sora", fontSize: 64, background: "#ff6a1a", color: "#111111" }, anim: { in: { id: "wipe", duration: 0.5 }, out: { id: "wipe", duration: 0.4 } } },
  { id: "comic", name: "Comic", hint: "Outlined, wiggles", style: { content: "BOOM", fontFamily: "Bebas Neue", fontSize: 180, color: "#ffffff", stroke: "#e11d48", strokeWidth: 12 }, anim: { in: { id: "zoom-out", duration: 0.4 }, loop: { id: "wiggle", duration: 0.8 } } },
  { id: "spin", name: "Spin", hint: "Spins in and out", style: { content: "Spin it", fontFamily: "Sora", fontSize: 110 }, anim: { in: { id: "spin", duration: 0.7 }, out: { id: "spin", duration: 0.6 } } },
  { id: "float", name: "Floating", hint: "Gently floats", style: { content: "dreamy", fontFamily: "Playfair Display", fontSize: 120, italic: true, glowColor: "#9ad5ff", glowSize: 16 }, anim: { in: { id: "fade", duration: 1 }, loop: { id: "float", duration: 3 } } },
  { id: "news", name: "Breaking", hint: "Red bar, from left", style: { content: "BREAKING NEWS", fontFamily: "Sora", fontSize: 60, background: "#d00000", align: "left" }, x: -0.2, y: 0.36, anim: { in: { id: "slide-right", duration: 0.4 } } },
  { id: 'sale', name: 'SALE', hint: 'Bold sale tag', style: { content: 'SALE', fontSize: 140, color: '#ffd400', stroke: '#111111', strokeWidth: 6 }, anim: { in: { id: 'pop', duration: 0.5 }, loop: { id: 'pulse', duration: 1.2 } } },
  { id: 'halloween', name: 'Spooky', hint: 'Flickering headline', style: { content: 'SPOOKY', fontSize: 140, fontFamily: 'Bebas Neue', color: '#ff8426', glowColor: '#ff8426', glowSize: 20 }, anim: { in: { id: 'flicker', duration: 0.8 }, loop: { id: 'wiggle', duration: 1.8 } } },
  { id: 'recipe', name: 'Recipe', hint: 'Recipe title', style: { content: 'Fresh from the kitchen', fontSize: 70, background: '#256e42' }, anim: { in: { id: 'rise', duration: 0.6 } } },
  { id: 'outline', name: 'Outline', hint: 'Outlined headline', style: { content: 'STAND OUT', fontSize: 120, color: '#ffffff', stroke: '#237bff', strokeWidth: 9 }, anim: { in: { id: 'zoom-out', duration: 0.5 } } },
  { id: 'quote', name: 'Quote', hint: 'Slow reveal', style: { content: '“Make it happen.”', fontSize: 90, fontFamily: 'Playfair Display', italic: true }, anim: { in: { id: 'fade', duration: 1.2 } } },
  { id: 'glitch-title', name: 'Glitch Title', hint: 'Flickering title', style: { content: 'SIGNAL LOST', fontSize: 100, fontFamily: 'JetBrains Mono', color: '#00ffd5' }, anim: { in: { id: 'flicker', duration: 0.7 }, loop: { id: 'flicker', duration: 2 } } },
  { id: 'bounce-tag', name: 'Bounce Tag', hint: 'Bouncing tag', style: { content: 'LOOK HERE', fontSize: 85, background: '#ed2756' }, anim: { in: { id: 'bounce', duration: 0.8 } } },
  { id: 'minimal', name: 'Minimal', hint: 'Clean title', style: { content: 'A new perspective', fontSize: 75, bold: false, fontFamily: 'Manrope' }, anim: { in: { id: 'fade', duration: 0.8 }, out: { id: 'fade', duration: 0.8 } } },
];

// Font-led animated layouts, with independently authored typography and placement.
const palettes = ['#ffe164', '#ff70ac', '#64e6ef', '#ffffff', '#c8f49c'];
for (let i = 0; TEXT_TEMPLATES.length < 60; i++) {
  const font = EDITOR_FONTS[i % EDITOR_FONTS.length]!;
  const variant = Math.floor(i / EDITOR_FONTS.length);
  TEXT_TEMPLATES.push({
    id: `editorial-${i}`, name: `${font} ${variant ? 'Spotlight' : 'Editorial'}`,
    hint: 'Animated editorial typography',
    style: { content: variant ? 'IN THE SPOTLIGHT' : 'Make it memorable', fontFamily: font,
      fontSize: 72 + (i % 5) * 18, color: palettes[i % palettes.length]!,
      letterSpacing: (i % 4) * 4, bold: i % 2 === 0,
      stroke: '#151522', strokeWidth: i % 3 === 0 ? 4 : 0,
      background: i % 4 === 0 ? '#30223fcc' : 'transparent' },
    y: ((i % 3) - 1) * 0.22,
    anim: { in: { id: ['rise', 'pop', 'wipe', 'typewriter', 'slide-right'][i % 5]!, duration: 0.7 },
      loop: { id: ['pulse', 'wiggle', 'flicker'][i % 3]!, duration: 2 },
      out: { id: 'fade', duration: 0.4 } },
  });
}

export function clipFromTemplate(t: TextTemplate, start: number, W: number, H: number): Clip {
  const c = textClip(start);
  c.name = t.id === "title" ? "Title" : t.name;
  if (c.text) c.text = { ...c.text, ...t.style };
  if (t.y) c.transform.y = H * t.y;
  if (t.x) c.transform.x = W * t.x;
  if (t.anim) c.anim = t.anim;
  return c;
}

export function shapeClip(type: string, start: number, fill = "#ff6a1a"): Clip {
  return {
    id: uid(),
    kind: "shape",
    name: type.charAt(0).toUpperCase() + type.slice(1),
    start,
    in: 0,
    out: TEXT_DEFAULT_DURATION,
    sourceDuration: STILL_SOURCE_DURATION,
    speed: 1,
    volume: 0,
    fadeIn: 0,
    fadeOut: 0,
    effects: defaultEffects(),
    transform: defaultTransform(),
    keyframes: {},
    shape: { type, fill, stroke: "#ffffff", strokeWidth: 0, w: type === "line" ? 500 : 320, h: type === "line" ? 40 : type === "arrow" ? 200 : 320 },
  };
}

export const SPEED_CURVES: { id: string; name: string; pts: SpeedPoint[] }[] = [
  { id: "montage", name: "Montage", pts: [{ t: 0, speed: 1 }, { t: 0.3, speed: 1 }, { t: 0.4, speed: 3 }, { t: 0.6, speed: 3 }, { t: 0.7, speed: 1 }, { t: 1, speed: 1 }] },
  { id: "hero", name: "Hero", pts: [{ t: 0, speed: 1.5 }, { t: 0.35, speed: 1.5 }, { t: 0.45, speed: 0.25 }, { t: 0.65, speed: 0.25 }, { t: 0.75, speed: 1.5 }, { t: 1, speed: 1.5 }] },
  { id: "bullet", name: "Bullet", pts: [{ t: 0, speed: 2 }, { t: 0.3, speed: 2 }, { t: 0.4, speed: 0.15 }, { t: 0.7, speed: 0.15 }, { t: 0.8, speed: 2 }, { t: 1, speed: 2 }] },
  { id: "jump", name: "Jump cut", pts: [{ t: 0, speed: 1 }, { t: 0.45, speed: 1 }, { t: 0.5, speed: 6 }, { t: 0.55, speed: 1 }, { t: 1, speed: 1 }] },
  { id: "flash-in", name: "Flash in", pts: [{ t: 0, speed: 5 }, { t: 0.3, speed: 1 }, { t: 1, speed: 1 }] },
  { id: "flash-out", name: "Flash out", pts: [{ t: 0, speed: 1 }, { t: 0.7, speed: 1 }, { t: 1, speed: 5 }] },
  { id: "ramp-up", name: "Ramp up", pts: [{ t: 0, speed: 0.5 }, { t: 1, speed: 3 }] },
  { id: "ramp-down", name: "Slow down", pts: [{ t: 0, speed: 3 }, { t: 1, speed: 0.3 }] },
];
