import { GENERATED_STICKERS, drawGeneratedSticker } from "./sticker-gen";
import type { ShapeStyle } from './types';

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
  }
  x.restore();
}