import { describe, it, expect } from 'vitest';
import { colorDistance, keyAlpha } from '../lib/editor/key';
import { defaultMask, maskGeometry } from '../lib/editor/mask';
import { cropRect, smoothCenter } from '../lib/editor/reframe';
describe('color key thresholds', () => {
  it('normalizes RGB distance', () => { expect(colorDistance([0,0,0],[255,255,255])).toBeCloseTo(1); expect(colorDistance([0,255,0],[0,255,0])).toBe(0); });
  it('removes matches and retains distant colors', () => { expect(keyAlpha(.1,.2,.1)).toBe(0); expect(keyAlpha(.4,.2,.1)).toBe(1); expect(keyAlpha(.25,.2,.1)).toBeCloseTo(.5); });
  it('handles hard edges', () => { expect(keyAlpha(0,0,0)).toBe(0); expect(keyAlpha(1,0,0)).toBe(1); });
});
describe('mask geometry', () => {
  it('scales normalized geometry', () => { expect(maskGeometry(defaultMask(),100,200)).toEqual({x:50,y:100,w:60,h:120,angle:0}); });
  it('converts rotation and prevents negative extents', () => { const g=maskGeometry({...defaultMask(),rotation:180,w:-1},100,100); expect(g.angle).toBe(Math.PI); expect(g.w).toBeGreaterThan(0); });
});
describe('reframe math', () => {
  it('crops landscape to portrait', () => { const r=cropRect(1920,1080,9/16); expect(r.w/r.h).toBeCloseTo(9/16); expect(r.x+r.w/2).toBe(960); });
  it('clamps centers at frame edges', () => { expect(cropRect(1920,1080,1,{x:-1,y:2})).toEqual({x:0,y:0,w:1080,h:1080}); });
  it('crops portrait vertically', () => { expect(cropRect(1080,1920,1)).toEqual({x:0,y:420,w:1080,h:1080}); });
  it('preserves full matching aspect', () => { expect(cropRect(1920,1080,16/9)).toEqual({x:0,y:0,w:1920,h:1080}); });
  it('smooths without overshoot', () => { expect(smoothCenter({x:0,y:1},{x:1,y:0},.25)).toEqual({x:.25,y:.75}); expect(smoothCenter({x:0,y:0},{x:1,y:1},2)).toEqual({x:1,y:1}); });
});
