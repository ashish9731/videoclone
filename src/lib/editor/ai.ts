/**
 * On-device person segmentation (MediaPipe selfie segmenter) for AI background
 * removal / portrait blur. Loads lazily in the browser; runs synchronously per frame.
 */
import { clear, ctx2d, poolCanvas } from "./fx";

type Segmenter = {
  segment: (img: HTMLCanvasElement) => { confidenceMasks?: { getAsFloat32Array: () => Float32Array; width: number; height: number }[]; close: () => void };
};

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let seg: Segmenter | null = null;
let loading: Promise<void> | null = null;
let failed: string | null = null;

export const AI_EFFECTS = new Set(["bg-remove", "bg-blur"]);
export const segmenterReady = () => seg !== null;
export const segmenterError = () => failed;

export function ensureSegmenter(): Promise<void> {
  if (seg) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    try {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: "GPU" | "CPU") =>
        ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      let s;
      try {
        s = await make("GPU");
      } catch {
        s = await make("CPU");
      }
      seg = s as unknown as Segmenter;
    } catch (e) {
      failed = e instanceof Error ? e.message : "AI model failed to load";
      loading = null;
      throw e;
    }
  })();
  return loading;
}

/** Soft person mask (alpha = person) as a canvas the size of L, or null if the model isn't ready. */
export function personMask(L: HTMLCanvasElement): HTMLCanvasElement | null {
  if (!seg) {
    ensureSegmenter().catch(() => {});
    return null;
  }
  const sw = 320, sh = Math.max(1, Math.round((L.height / L.width) * 320));
  const small = poolCanvas("ai-in", sw, sh);
  clear(small);
  const sx = ctx2d(small);
  sx.fillStyle = "#000";
  sx.fillRect(0, 0, sw, sh);
  sx.drawImage(L, 0, 0, sw, sh);
  const r = seg.segment(small);
  const m = r.confidenceMasks?.[0];
  if (!m) {
    r.close();
    return null;
  }
  // MediaPipe owns the view; copy before result.close frees its backing memory.
  const data = new Float32Array(m.getAsFloat32Array());
  const mw = m.width, mh = m.height;
  r.close();
  const mc = poolCanvas("ai-mask-small", mw, mh);
  const mx = ctx2d(mc);
  const img = mx.createImageData(mw, mh);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(0, Math.min(1, (data[i]! - 0.3) / 0.4)); // soften the edge
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = v * 255;
  }
  mx.putImageData(img, 0, 0);
  const full = poolCanvas("ai-mask", L.width, L.height);
  clear(full);
  const fx = ctx2d(full);
  fx.imageSmoothingEnabled = true;
  fx.imageSmoothingQuality = "high";
  fx.drawImage(mc, 0, 0, L.width, L.height);
  return full;
}
