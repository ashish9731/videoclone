import { type Watermark } from "./types";

/** Resolves the logo asset to a decodable image; returns null while it is still loading or missing. */
export type WatermarkImageGetter = (assetId: string) => CanvasImageSource | null;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function imageSize(src: CanvasImageSource): [number, number] {
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement)
    return [src.naturalWidth, src.naturalHeight];
  if (typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement)
    return [src.width, src.height];
  const s = src as { width: number; height: number };
  return [s.width, s.height];
}

/**
 * Paint the watermark as a final, always-on-top pass. The whole frame is covered by a translucent
 * mark (single corner/center, or a diagonal tiled field) so it reads as a genuine watermark rather
 * than a sticker, and it cannot be cropped to a corner while tiled. Drawing is shared verbatim by
 * preview and export through renderFrame.
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  wm: Watermark,
  W: number,
  H: number,
  getLogo?: WatermarkImageGetter | undefined,
): void {
  if (!wm.enabled) return;

  const size = Math.max(6, clamp(wm.size, 0, 1) * H);
  let img: CanvasImageSource | null = null;
  let unitW = 0;
  let unitH = size;

  if (wm.kind === "logo") {
    img = wm.logoAssetId && getLogo ? getLogo(wm.logoAssetId) : null;
    if (!img) return;
    const [sw, sh] = imageSize(img);
    if (!sw || !sh) return;
    unitH = size;
    unitW = size * (sw / sh);
  } else {
    ctx.font = `${wm.bold ? 700 : 400} ${size}px sans-serif`;
    unitW = ctx.measureText(wm.text || " ").width;
    unitH = size;
  }
  if (unitW <= 0) return;

  // the mark is drawn centred on the current transform origin
  const paintUnit = () => {
    if (wm.kind === "logo" && img) ctx.drawImage(img, -unitW / 2, -unitH / 2, unitW, unitH);
    else {
      ctx.fillStyle = wm.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(wm.text, 0, 0);
    }
  };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = clamp(wm.opacity, 0, 1);

  if (wm.tiled) {
    const diag = Math.hypot(W, H);
    const gapX = unitW * 1.5 + size * 0.8;
    const gapY = unitH * 2.4 + size;
    ctx.translate(W / 2, H / 2);
    ctx.rotate((wm.rotation * Math.PI) / 180);
    for (let y = -diag / 2; y <= diag / 2; y += gapY) {
      for (let x = -diag / 2; x <= diag / 2; x += gapX) {
        ctx.save();
        ctx.translate(x, y);
        paintUnit();
        ctx.restore();
      }
    }
  } else {
    const pad = clamp(wm.padding, 0, 0.5) * H;
    let cx = W / 2;
    let cy = H / 2;
    if (wm.position !== "center") {
      cx = wm.position.endsWith("left")
        ? pad + unitW / 2
        : wm.position.endsWith("right")
          ? W - pad - unitW / 2
          : W / 2;
      cy = wm.position.startsWith("top")
        ? pad + unitH / 2
        : wm.position.startsWith("bottom")
          ? H - pad - unitH / 2
          : H / 2;
    }
    ctx.translate(cx, cy);
    ctx.rotate((wm.rotation * Math.PI) / 180);
    paintUnit();
  }
  ctx.restore();
}
