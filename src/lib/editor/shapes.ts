import type { ShapeStyle } from "./types";
import { drawSticker } from './stickers';

export const SHAPES: { id: string; name: string }[] = [
  { id: "rect", name: "Rectangle" },
  { id: "rounded", name: "Rounded" },
  { id: "circle", name: "Circle" },
  { id: "triangle", name: "Triangle" },
  { id: "star", name: "Star" },
  { id: "heart", name: "Heart" },
  { id: "arrow", name: "Arrow" },
  { id: "hexagon", name: "Hexagon" },
  { id: "bubble", name: "Speech bubble" },
  { id: "line", name: "Line" },
  { id: "ring", name: "Ring" },
  { id: "burst", name: "Burst" },
];

function path(x: CanvasRenderingContext2D, type: string, w: number, h: number) {
  const hw = w / 2, hh = h / 2;
  x.beginPath();
  switch (type) {
    case "rounded":
      x.roundRect(-hw, -hh, w, h, Math.min(w, h) * 0.2);
      break;
    case "circle":
    case "ring":
      x.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;
    case "triangle":
      x.moveTo(0, -hh);
      x.lineTo(hw, hh);
      x.lineTo(-hw, hh);
      x.closePath();
      break;
    case "star":
    case "burst": {
      const n = type === "star" ? 5 : 12;
      const inner = type === "star" ? 0.42 : 0.72;
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 === 0 ? 1 : inner;
        const a = (i * Math.PI) / n - Math.PI / 2;
        const px = Math.cos(a) * hw * r, py = Math.sin(a) * hh * r;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      break;
    }
    case "heart":
      x.moveTo(0, hh);
      x.bezierCurveTo(-w * 0.6, h * 0.05, -w * 0.45, -hh * 1.1, 0, -hh * 0.45);
      x.bezierCurveTo(w * 0.45, -hh * 1.1, w * 0.6, h * 0.05, 0, hh);
      break;
    case "arrow":
      x.moveTo(-hw, -hh * 0.35);
      x.lineTo(hw * 0.2, -hh * 0.35);
      x.lineTo(hw * 0.2, -hh);
      x.lineTo(hw, 0);
      x.lineTo(hw * 0.2, hh);
      x.lineTo(hw * 0.2, hh * 0.35);
      x.lineTo(-hw, hh * 0.35);
      x.closePath();
      break;
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = Math.cos(a) * hw, py = Math.sin(a) * hh;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.closePath();
      break;
    case "bubble":
      x.roundRect(-hw, -hh, w, h * 0.78, Math.min(w, h) * 0.18);
      x.moveTo(-hw * 0.4, -hh + h * 0.78 - 1);
      x.lineTo(-hw * 0.55, hh);
      x.lineTo(-hw * 0.05, -hh + h * 0.78 - 1);
      x.closePath();
      break;
    case "line":
      x.rect(-hw, -Math.max(2, hh * 0.08), w, Math.max(4, h * 0.08));
      break;
    default:
      x.rect(-hw, -hh, w, h);
  }
}

/** Draw a shape centered at the origin; k = canvas px per project unit. */
export function drawShape(x: CanvasRenderingContext2D, s: ShapeStyle, k: number) {
  if (s.type.startsWith('sticker:')) { drawSticker(x, s, k); return; }
  const w = s.w * k, h = s.h * k;
  path(x, s.type, w, h);
  if (s.type === "ring") {
    x.lineWidth = Math.max(2, Math.min(w, h) * 0.12);
    x.strokeStyle = s.fill;
    x.stroke();
    return;
  }
  if (s.fill) {
    x.fillStyle = s.fill;
    x.fill();
  }
  if (s.strokeWidth > 0) {
    x.lineJoin = "round";
    x.lineWidth = s.strokeWidth * k;
    x.strokeStyle = s.stroke;
    x.stroke();
  }
}
