import type { Clip, Keyframe } from './types';
import { interpolate } from './types';
import { poolCanvas, clear, ctx2d, blurInPlace } from './fx';
export type MaskProp = 'x' | 'y' | 'w' | 'h' | 'rotation' | 'feather';
export interface ClipMask {
  type: 'linear' | 'mirror' | 'circle' | 'rect' | 'heart' | 'star';
  x: number; y: number; w: number; h: number; rotation: number; feather: number; radius: number; invert: boolean;
  keyframes?: Partial<Record<MaskProp, Keyframe[]>> | undefined;
}
export const defaultMask = (): ClipMask => ({ type: 'circle', x: .5, y: .5, w: .6, h: .6, rotation: 0, feather: 0, radius: .05, invert: false });
export function maskGeometry(m: ClipMask, width: number, height: number) {
  return { x: m.x * width, y: m.y * height, w: Math.max(.001, m.w) * width, h: Math.max(.001, m.h) * height, angle: m.rotation * Math.PI / 180 };
}
export function applyMask(layer: HTMLCanvasElement, mask: Clip['mask'], local: number) {
  if (!mask) return;
  const m = { ...mask };
  for (const p of ['x','y','w','h','rotation','feather'] as const) m[p] = interpolate(mask.keyframes?.[p], local, m[p]);
  const { x, y, w, h, angle } = maskGeometry(m, layer.width, layer.height);
  const canvas = poolCanvas('clip-mask', layer.width, layer.height); clear(canvas);
  const ctx = ctx2d(canvas); ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.fillStyle = '#fff'; ctx.beginPath();
  if (m.type === 'circle') ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
  else if (m.type === 'heart') { ctx.moveTo(0,h/2); ctx.bezierCurveTo(-w,-h/8,-w/3,-h*.85,0,-h/4); ctx.bezierCurveTo(w/3,-h*.85,w,-h/8,0,h/2); }
  else if (m.type === 'star') { for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, r=i%2 ? .22:.5; const px=Math.cos(a)*w*r, py=Math.sin(a)*h*r; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); } ctx.closePath(); }
  else if (m.type === 'linear') ctx.rect(-layer.width*2,0,layer.width*4,layer.height*4);
  else ctx.roundRect(-w/2,-h/2,w,h,Math.min(w/2,h/2,m.radius*Math.min(layer.width,layer.height)));
  ctx.fill(); ctx.restore();
  blurInPlace(canvas, m.feather * Math.min(layer.width,layer.height));
  const dest=ctx2d(layer); dest.save(); dest.globalCompositeOperation=m.invert?'destination-out':'destination-in'; dest.drawImage(canvas,0,0); dest.restore();
}
