/** Recolorable vector geometry, not platform-dependent emoji glyphs. */
const families = ['Faces', 'Arrows', 'Badges', 'Bubbles', 'Shapes', 'Animals', 'Weather', 'Celebration', 'Icons'];
export const GENERATED_STICKERS = families.flatMap((group, f) => Array.from({ length: 12 }, (_, n) => ({
  id: `vector-${f}-${n}`, name: `${group} ${n + 1}`, group, fill: `hsl(${f * 39 + n * 17} 85% 65%)`,
})));
export function drawGeneratedSticker(x: CanvasRenderingContext2D, id: string, fill: string, ink: string): boolean {
  if (!id.startsWith('vector-')) return false;
  const [, f, variant] = id.split('-'), family = Number(f), n = Number(variant);
  const polygon = (count: number, radius: number, inner = radius) => {
    x.beginPath();for(let i=0;i<count;i++){const a=i*Math.PI*2/count-Math.PI/2,r=i%2?inner:radius;const px=Math.cos(a)*r,py=Math.sin(a)*r;if(i)x.lineTo(px,py);else x.moveTo(px,py);}x.closePath();x.fill();x.stroke();
  };
  const ellipse = (cx:number,cy:number,rx:number,ry:number) => {x.beginPath();x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);x.fill();x.stroke();};
  x.fillStyle=fill;x.strokeStyle=ink;x.lineWidth=5;
  if(family===0 || family===5){
    if(family===5){x.beginPath();x.moveTo(-65,-25);x.lineTo(-75,-90+n*3);x.lineTo(-20,-55);x.moveTo(65,-25);x.lineTo(75,-90+n*3);x.lineTo(20,-55);x.fill();x.stroke();}
    ellipse(0,0,76,65+n);x.fillStyle=ink;
    if(n%3===0){x.save();x.translate(-27,-18);polygon(10,16,7);x.translate(54,0);polygon(10,16,7);x.restore();}
    else{ellipse(-28,-18,6+n%4,7+n%5*2);ellipse(28,-18,6+n%4,7+n%5*2);}
    x.beginPath();x.moveTo(-35,25);x.quadraticCurveTo(0, n%2 ? -5-n*2:65+n,35,25);x.stroke();
    if(n>5){x.fillStyle='#ed849b';ellipse(-48,12,13,6);ellipse(48,12,13,6);}
  } else if(family===1){
    x.rotate(n*Math.PI/6);x.beginPath();x.moveTo(-80,-16);x.lineTo(20,-16);x.lineTo(20,-48);x.lineTo(85,0);x.lineTo(20,48);x.lineTo(20,16);x.lineTo(-80,16);x.closePath();x.fill();x.stroke();
  } else if(family===2 || family===4){polygon(family===2 ? 12+n*2 : 3+n,82,family===2?55:82);if(family===2){x.fillStyle='#fff';polygon(3+n%5,34);}}
  else if(family===3){x.beginPath();x.roundRect(-85,-55,170,110,10+n*3);x.fill();x.stroke();x.beginPath();x.moveTo(-50+n*7,55);x.lineTo(-65+n*9,90);x.lineTo(-15+n*7,55);x.fill();x.stroke();x.fillStyle=ink;for(let i=0;i<1+n%4;i++)ellipse(-40+i*25,0,6,6);}
  else if(family===6){
    if(n<4){polygon(16+n*2,85,55);x.fillStyle='#ffeeb2';ellipse(0,0,40,40);}
    else {ellipse(-30,0,40,30);ellipse(10,-20,45,40);ellipse(45,5,32,25);x.strokeStyle=n<8?'#65bbff':'#fff';for(let i=0;i<n-2;i++){x.beginPath();x.moveTo(-55+i*16,45);x.lineTo(-65+i*16,65+n);x.stroke();}}
  } else if(family===7){for(let i=0;i<5+n;i++){x.save();x.rotate(i*2.399);x.translate(45+i*2,0);x.rotate(i);x.fillStyle=i%2?fill:'#ffd852';polygon(3+n%4,10+n%5);x.restore();}}
  else {x.save();x.rotate(n*Math.PI/12);polygon(4+n%5,80, n%2?48:80);x.fillStyle='#fff';polygon(3+n%4,36,18);x.restore();}
  return true;
}
