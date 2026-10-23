import { useEffect, useRef, useState } from "react";
import { type EditorStore, useEditor } from "@/lib/editor/store";
import { type Clip, type MediaAsset } from "@/lib/editor/types";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw } from "lucide-react";

/**
 * Interactive crop overlay for video / image clips.
 * Visible when the Inspector's tab is "crop"; replaces the TransformOverlay so
 * the user drags the crop rectangle directly on the preview canvas.
 * The rectangle lives in the untransformed source frame so what you see is what
 * `clip.crop` stores (a normalized source rect used by render.ts + export.ts).
 */

interface Props {
  store: EditorStore;
  assets: Map<string, MediaAsset>;
  canvas: HTMLCanvasElement | null;
  width: number;
  height: number;
}

type Crop = { x: number; y: number; w: number; h: number };
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";
const MIN = 0.04;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Preset aspect ratios; value = width/height, or 0 for "free". */
const ASPECTS: { id: string; label: string; value: number }[] = [
  { id: "free", label: "Free", value: 0 },
  { id: "orig", label: "Original", value: -1 },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "3:4", label: "3:4", value: 3 / 4 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
  { id: "21:9", label: "21:9", value: 21 / 9 },
];

/** Center a full-frame crop with the given target visible aspect on the source. */
function centerCropFor(aspect: number, srcAspect: number): Crop {
  // visibleAspect = srcAspect * w / h → w/h = visibleAspect / srcAspect
  const ratio = aspect / srcAspect;
  if (ratio >= 1) {
    const h = 1 / ratio;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  return { x: (1 - ratio) / 2, y: 0, w: ratio, h: 1 };
}

/** Given an existing crop + new aspect, refit while keeping the crop's center. */
function refitAspect(crop: Crop, aspect: number, srcAspect: number): Crop {
  const ratio = aspect / srcAspect; // target w/h in normalized source space
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  // Preserve the larger axis, adjust the other to satisfy w = h * ratio.
  let w = crop.w;
  let h = w / ratio;
  if (h > 1) { h = 1; w = h * ratio; }
  if (w > 1) { w = 1; h = w / ratio; }
  const x = clamp(cx - w / 2, 0, 1 - w);
  const y = clamp(cy - h / 2, 0, 1 - h);
  return { x, y, w, h };
}

export function CropOverlay({ store, assets, canvas, width, height }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const timeline = useEditor(store, (s) => s.timeline);
  const selectedId = useEditor(store, (s) => s.selectedClipId);
  const inspectorTab = useEditor(store, (s) => s.inspectorTab);
  const [aspectId, setAspectId] = useState<string>("free");

  useEffect(() => {
    if (!canvas || !rootRef.current) return;
    const root = rootRef.current;
    const update = () => {
      const a = canvas.getBoundingClientRect();
      const b = root.getBoundingClientRect();
      setRect({ left: a.left - b.left, top: a.top - b.top, w: a.width, h: a.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    ro.observe(root);
    return () => ro.disconnect();
  }, [canvas]);

  useEffect(() => {
    // Reset aspect lock when switching clips or leaving crop mode.
    setAspectId("free");
  }, [selectedId, inspectorTab]);

  if (inspectorTab !== "crop") return null;

  let sel: Clip | null = null;
  for (const tr of timeline.tracks) {
    const c = tr.clips.find((x) => x.id === selectedId);
    if (c) { sel = c; break; }
  }
  if (!sel) return null;
  if (sel.kind !== "video" && sel.kind !== "image") {
    return (
      <div ref={rootRef} className="pointer-events-none absolute inset-0 flex items-end justify-center p-4">
        <div className="pointer-events-auto rounded-md bg-panel/90 px-3 py-2 text-xs text-muted-foreground shadow">
          Crop is available only for video and image clips.
        </div>
      </div>
    );
  }
  const asset = sel.assetId ? assets.get(sel.assetId) : undefined;
  const srcW = asset?.width ?? width;
  const srcH = asset?.height ?? height;
  if (!srcW || !srcH || rect.w <= 0 || rect.h <= 0) return null;
  const srcAspect = srcW / srcH;

  // Display box: full source rect fit-inside the canvas, ignoring the clip's transform.
  const boxW = Math.min(rect.w, rect.h * srcAspect);
  const boxH = boxW / srcAspect;
  const boxX = rect.left + (rect.w - boxW) / 2;
  const boxY = rect.top + (rect.h - boxH) / 2;

  const crop: Crop = sel.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const clipId = sel.id;
  const setCrop = (next: Crop) => store.updateClip(clipId, (cl) => ({ ...cl, crop: next }));
  const activeAspect = () => {
    const preset = ASPECTS.find((a) => a.id === aspectId);
    if (!preset || preset.value === 0) return 0;
    if (preset.value === -1) return srcAspect; // Original → source aspect (no crop)
    return preset.value;
  };

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const b = rootRef.current?.getBoundingClientRect();
    if (!b) return { x: 0, y: 0 };
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  const startDrag = (e: React.PointerEvent, kind: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    store.set({ playing: false });
    store.beginGesture();
    const orig = { ...crop };
    const start = toLocal(e);
    const ratio = activeAspect();
    const move = (ev: PointerEvent) => {
      const pt = toLocal(ev);
      const dx = (pt.x - start.x) / boxW;
      const dy = (pt.y - start.y) / boxH;
      let next: Crop;
      if (kind === "move") {
        next = {
          x: clamp(orig.x + dx, 0, 1 - orig.w),
          y: clamp(orig.y + dy, 0, 1 - orig.h),
          w: orig.w,
          h: orig.h,
        };
      } else {
        let x = orig.x, y = orig.y, w = orig.w, h = orig.h;
        const right = orig.x + orig.w, bottom = orig.y + orig.h;
        if (kind.includes("w")) { x = clamp(orig.x + dx, 0, right - MIN); w = right - x; }
        if (kind.includes("e")) { w = clamp(orig.w + dx, MIN, 1 - x); }
        if (kind.includes("n") && kind !== "ne" && kind !== "nw") { y = clamp(orig.y + dy, 0, bottom - MIN); h = bottom - y; }
        if (kind === "n" || kind === "nw" || kind === "ne") { y = clamp(orig.y + dy, 0, bottom - MIN); h = bottom - y; }
        if (kind.includes("s") && kind !== "se" && kind !== "sw") { h = clamp(orig.h + dy, MIN, 1 - y); }
        if (kind === "s" || kind === "se" || kind === "sw") { h = clamp(orig.h + dy, MIN, 1 - y); }
        next = { x, y, w, h };
        if (ratio > 0) {
          // Adjust the less-constrained axis to satisfy w/h = ratio / srcAspect.
          const target = ratio / srcAspect;
          if (kind.length === 1) {
            // Edge handle: keep the dragged axis and grow the other from center.
            if (kind === "n" || kind === "s") {
              const cx = orig.x + orig.w / 2;
              w = h * target;
              x = clamp(cx - w / 2, 0, 1 - w);
              if (x + w > 1) { w = 1 - x; h = w / target; y = kind === "n" ? bottom - h : orig.y; }
            } else {
              const cy = orig.y + orig.h / 2;
              h = w / target;
              y = clamp(cy - h / 2, 0, 1 - h);
              if (y + h > 1) { h = 1 - y; w = h * target; x = kind === "w" ? right - w : orig.x; }
            }
          } else {
            // Corner handle: adjust h from w.
            const keepRight = kind.includes("e");
            const keepBottom = kind.includes("s");
            h = w / target;
            if (h > 1) { h = 1; w = h * target; }
            if (kind.includes("w")) x = keepRight ? right - w : orig.x;
            if (kind.includes("n")) y = keepBottom ? bottom - h : orig.y;
            x = clamp(x, 0, 1 - w);
            y = clamp(y, 0, 1 - h);
          }
          next = { x, y, w, h };
        }
      }
      setCrop(next);
    };
    const up = () => {
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const applyAspect = (id: string) => {
    setAspectId(id);
    const preset = ASPECTS.find((a) => a.id === id);
    if (!preset) return;
    if (id === "orig") { setCrop({ x: 0, y: 0, w: 1, h: 1 }); return; }
    if (preset.value === 0) return;
    const targetA = preset.value === -1 ? srcAspect : preset.value;
    setCrop(refitAspect(crop, targetA, srcAspect));
  };

  const reset = () => { setCrop({ x: 0, y: 0, w: 1, h: 1 }); setAspectId("free"); };
  const done = () => store.set({ inspectorTab: "basic" });

  // Rectangle in canvas pixel coordinates.
  const rx = boxX + crop.x * boxW;
  const ry = boxY + crop.y * boxH;
  const rw = crop.w * boxW;
  const rh = crop.h * boxH;

  const handle = "absolute size-3 rounded-sm border-2 border-primary bg-background";
  const positions: [Handle, number, number, string][] = [
    ["nw", rx, ry, "-translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"],
    ["n", rx + rw / 2, ry, "-translate-x-1/2 -translate-y-1/2 cursor-ns-resize"],
    ["ne", rx + rw, ry, "-translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"],
    ["e", rx + rw, ry + rh / 2, "-translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
    ["se", rx + rw, ry + rh, "-translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"],
    ["s", rx + rw / 2, ry + rh, "-translate-x-1/2 -translate-y-1/2 cursor-ns-resize"],
    ["sw", rx, ry + rh, "-translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"],
    ["w", rx, ry + rh / 2, "-translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
  ];

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      {/* Dim outside the crop rect using 4 slabs. */}
      <div className="pointer-events-auto absolute bg-black/60" style={{ left: boxX, top: boxY, width: boxW, height: crop.y * boxH }} />
      <div className="pointer-events-auto absolute bg-black/60" style={{ left: boxX, top: ry + rh, width: boxW, height: (1 - crop.y - crop.h) * boxH }} />
      <div className="pointer-events-auto absolute bg-black/60" style={{ left: boxX, top: ry, width: crop.x * boxW, height: rh }} />
      <div className="pointer-events-auto absolute bg-black/60" style={{ left: rx + rw, top: ry, width: (1 - crop.x - crop.w) * boxW, height: rh }} />

      {/* Source outline */}
      <div className="pointer-events-none absolute border border-white/40" style={{ left: boxX, top: boxY, width: boxW, height: boxH }} />

      {/* Crop rectangle */}
      <div
        className="pointer-events-auto absolute cursor-move border-2 border-primary"
        style={{ left: rx, top: ry, width: rw, height: rh }}
        onPointerDown={(e) => startDrag(e, "move")}
        role="presentation"
      >
        {/* Rule-of-thirds guides */}
        <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/40" />
        <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/40" />
        <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/40" />
        <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/40" />
      </div>

      {/* 8 resize handles (positioned in the root overlay so they can be grabbed outside the rect too) */}
      {positions.map(([kind, hx, hy, cls]) => (
        <div
          key={kind}
          className={`${handle} ${cls} pointer-events-auto`}
          style={{ left: hx, top: hy }}
          onPointerDown={(e) => startDrag(e, kind)}
          role="presentation"
          aria-label={`Crop ${kind}`}
        />
      ))}

      {/* Floating toolbar */}
      <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-md bg-panel/95 px-2 py-1 text-xs shadow-lg" style={{ bottom: 8 }}>
        {ASPECTS.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={aspectId === a.id ? "default" : "ghost"}
            className="h-6 px-2 text-[11px]"
            onClick={() => applyAspect(a.id)}
            title={a.id === "orig" ? "Show the full source (reset crop)" : `Crop to ${a.label}`}
          >
            {a.label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={reset} title="Reset crop to full frame">
          <RotateCcw className="mr-1 size-3" /> Reset
        </Button>
        <Button size="sm" variant="secondary" className="h-6 px-2 text-[11px]" onClick={done} title="Exit crop mode">
          <Check className="mr-1 size-3" /> Done
        </Button>
      </div>
    </div>
  );
}
