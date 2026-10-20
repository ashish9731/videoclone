import { GENERATED_STICKERS, drawGeneratedSticker } from "./sticker-gen";
import type { ShapeStyle } from './types';

export const ART_STICKERS = [
  ...GENERATED_STICKERS,
  { id: 'happy', name: 'Happy Face', fill: '#ffd84b' },
  { id: 'love', name: 'Love Letter', fill: '#ed4b83' },
  { id: 'rocket', name: 'Rocket', fill: '#fa653b' },
  { id: 'flame', name: 'Flame', fill: '#ff702e' },
  { id: 'party', name: 'Party Popper', fill: '#b06cef' },
  { id: 'camera', name: 'Camera', fill: '#489fcb' },
  { id: 'music', name: 'Music Note', fill: '#65bf98' },
  { id: 'lightning', name: 'Lightning', fill: '#ffdb49' },
  { id: 'pin', name: 'Location Pin', fill: '#ef5872' },
  { id: 'check', name: 'Verified Check', fill: '#4ebd8a' },
  { id: 'flower', name: 'Flower', fill: '#f582ba' },
  { id: 'cat', name: 'Curious Cat', fill: '#e8a458' },
] as const;

/** Original illustrated sticker artwork. Coordinates are authored in a 200-unit square. */
export function drawSticker(x: CanvasRenderingContext2D, s: ShapeStyle, k: number) {
  x.save(); x.scale(s.w * k / 200, s.h * k / 200);
  const ink = s.strokeWidth > 0 ? s.stroke : '#20232b';
  x.lineJoin = 'round'; x.lineCap = 'round'; x.lineWidth = 5 + s.strokeWidth / 2;
  const poly = (pts: number[][], fill: string, stroke = '#ffffff') => {
    x.beginPath(); pts.forEach((p,i) => { const a=p[0] ?? 0,b=p[1] ?? 0; if(i)x.lineTo(a,b);else x.moveTo(a,b); }); x.closePath();x.fillStyle=fill;x.fill();x.strokeStyle=stroke;x.stroke();
  };
  const oval = (cx:number,cy:number,rx:number,ry:number,fill:string,stroke='#ffffff') => {x.beginPath();x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);x.fillStyle=fill;x.fill();x.strokeStyle=stroke;x.stroke();};
  const line = (pts:number[][],color:string,width=5) => {x.beginPath();pts.forEach((p,i)=>{if(i)x.lineTo(p[0]??0,p[1]??0);else x.moveTo(p[0]??0,p[1]??0);});x.strokeStyle=color;x.lineWidth=width;x.stroke();};
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
  }
  x.restore();
}