export interface Center { x: number; y: number }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function smoothCenter(previous: Center, target: Center, alpha = .12): Center {
  const k = clamp(alpha, 0, 1);
  return { x: previous.x + (target.x - previous.x) * k, y: previous.y + (target.y - previous.y) * k };
}
export function cropRect(width: number, height: number, aspect: number, center: Center = { x: .5, y: .5 }) {
  const w = Math.min(width, height * aspect), h = Math.min(height, width / aspect);
  return { x: clamp(center.x * width - w / 2, 0, width - w), y: clamp(center.y * height - h / 2, 0, height - h), w, h };
}
/** Stateful, causal saliency tracker: edge energy plus inter-frame luma motion. */
export class Reframer {
  private previous: Float32Array | null = null;
  private center: Center = { x: .5, y: .5 };
  private canvas: HTMLCanvasElement | null = null;
  sample(frame: HTMLCanvasElement): Center {
    const c = this.canvas ??= document.createElement('canvas'); c.width=64; c.height=36;
    const ctx=c.getContext('2d', { willReadFrequently:true })!; ctx.drawImage(frame,0,0,64,36);
    const d=ctx.getImageData(0,0,64,36).data, l=new Float32Array(64*36);
    for(let i=0;i<l.length;i++) l[i]=d[i*4]!*.299+d[i*4+1]!*.587+d[i*4+2]!*.114;
    let sx=0,sy=0,total=0;
    for(let y=1;y<35;y++) for(let x=1;x<63;x++){const i=y*64+x; const e=Math.abs(l[i+1]!-l[i-1]!)+Math.abs(l[i+64]!-l[i-64]!); const weight=e+2*Math.abs(l[i]!-(this.previous?.[i]??l[i]!)); sx+=weight*x/63; sy+=weight*y/35; total+=weight;}
    this.previous=l;
    if(total>0) this.center=smoothCenter(this.center,{x:sx/total,y:sy/total});
    return this.center;
  }
}
