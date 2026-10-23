import { useEffect, useRef, useState } from "react";
import { type EditorStore, useEditor } from "@/lib/editor/store";
import { applyAnimated, poseAt } from "@/lib/editor/keyframes";
import { wrapLines } from "@/lib/editor/render";
import { type Clip, type MediaAsset, type Timeline, clipDuration, isActive } from "@/lib/editor/types";
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface Props {
  store: EditorStore;
  assets: Map<string, MediaAsset>;
  canvas: HTMLCanvasElement | null;
  width: number; // project size
  height: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
type Size = [number, number];
// Clip objects are replaced on every edit, so the clip itself is a safe cache key; measuring text
// (font + wrapLines) per playhead tick was costing more than the canvas draw.
const contentCache = new WeakMap<Clip, { w: number; h: number; size: Size }>();

/** Untransformed content size of a clip, in project units. */
export function contentSize(c: Clip, assets: Map<string, MediaAsset>, W: number, H: number): Size | null {
  const hit = contentCache.get(c);
  if (hit && hit.w === W && hit.h === H) return hit.size;
  const size = measureContentSize(c, assets, W, H);
  // the video/image fallback (asset metadata not loaded yet) is deliberately not cached
  if (size && (c.kind === "text" || c.kind === "shape" || (c.assetId ? !!assets.get(c.assetId)?.width && !!assets.get(c.assetId)?.height : false))) {
    contentCache.set(c, { w: W, h: H, size });
  }
  return size;
}

function measureContentSize(c: Clip, assets: Map<string, MediaAsset>, W: number, H: number): Size | null {
  if (c.kind === "text" && c.text) {
    measureCtx ??= document.createElement("canvas").getContext("2d");
    const ctx = measureCtx;
    if (!ctx) return null;
    const s = c.text;
    ctx.font = `${s.italic ? "italic " : ""}${s.bold ? "700" : "400"} ${s.fontSize}px "${s.fontFamily}", sans-serif`;
    const lines = wrapLines(ctx, s.content, W * 0.9);
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const pad = s.background ? s.fontSize * 0.6 : s.fontSize * 0.15;
    return [w + pad, lines.length * s.fontSize * 1.25 + pad * 0.5];
  }
  if (c.kind === "shape" && c.shape) return [c.shape.w, c.shape.h];
  if (c.kind === "video" || c.kind === "image") {
    const a = c.assetId ? assets.get(c.assetId) : undefined;
    if (!a?.width || !a.height) return [W, H];
    const cw = a.width * (c.crop?.w ?? 1), ch = a.height * (c.crop?.h ?? 1);
    const fit = Math.min(W / cw, H / ch);
    return [cw * fit, ch * fit];
  }
  return null;
}

type Mode = "move" | "scale" | "rotate";

export function TransformOverlay({ store, assets, canvas, width, height }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ left: 0, top: 0, w: 0, h: 0 });
  const timeline = useEditor(store, (s) => s.timeline);
  const selectedId = useEditor(store, (s) => s.selectedClipId);
  // Only the selected clip's box has to follow the playhead, so an idle stage stays out of the
  // per-frame ticks instead of rebuilding this subtree 60x a second.
  const time = useEditor(store, (s) => (selectedId ? s.time : 0));
  const animate = useEditor(store, (s) => s.animate);

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

  const s = rect.w / width; // display px per project unit

  /** Visual clips active at `t`, top layer first. The clip kind decides, not the lane type. */
  const targetsAt = (tl: Timeline, t: number): { clip: Clip; locked: boolean }[] => {
    const found: { clip: Clip; locked: boolean }[] = [];
    for (const tr of tl.tracks) {
      if (tr.hidden) continue;
      for (const c of [...tr.clips].reverse()) if (isActive(c, t) && c.kind !== "audio") found.push({ clip: c, locked: tr.locked });
    }
    return found;
  };
  const active = targetsAt(timeline, time);

  const boxOf = (c: Clip, at = time) => {
    const size = contentSize(c, assets, width, height);
    if (!size) return null;
    const local = Math.max(0, Math.min(clipDuration(c), at - c.start));
    const p = poseAt(c, local);
    return { local, p, w: size[0] * p.scale * s, h: size[1] * p.scale * s, cx: rect.w / 2 + p.x * s, cy: rect.h / 2 + p.y * s };
  };

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const b = rootRef.current?.getBoundingClientRect();
    if (!b) return { x: 0, y: 0 };
    return { x: e.clientX - b.left - rect.left, y: e.clientY - b.top - rect.top };
  };

  const startDrag = (e: React.PointerEvent, clip: Clip, mode: Mode) => {
    e.preventDefault();
    e.stopPropagation();
    const box = boxOf(clip, store.get().time);
    if (!box) return;
    store.set({ selectedClipId: clip.id, playing: false });
    store.beginGesture();
    const start = toLocal(e);
    const orig = box.p;
    const startDist = Math.hypot(start.x - box.cx, start.y - box.cy) || 1;
    const record = store.get().animate;
    const move = (ev: PointerEvent) => {
      const pt = toLocal(ev);
      let patch: Record<string, number>;
      if (mode === "move") {
        let x = orig.x + (pt.x - start.x) / s;
        let y = orig.y + (pt.y - start.y) / s;
        if (!ev.altKey) {
          // snap to center lines
          const thr = 8 / s;
          if (Math.abs(x) < thr) x = 0;
          if (Math.abs(y) < thr) y = 0;
        }
        patch = { x: Math.round(x), y: Math.round(y) };
      } else if (mode === "scale") {
        const d = Math.hypot(pt.x - box.cx, pt.y - box.cy);
        patch = { scale: Math.max(0.05, Math.min(10, Math.round(orig.scale * (d / startDist) * 100) / 100)) };
      } else {
        let deg = (Math.atan2(pt.y - box.cy, pt.x - box.cx) * 180) / Math.PI + 90;
        if (deg > 180) deg -= 360;
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
        else if (Math.abs(deg) < 3) deg = 0;
        patch = { rotation: Math.round(deg * 10) / 10 };
      }
      store.updateClip(clip.id, (c) => applyAnimated(c, box.local, patch, record));
    };
    const up = () => {
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // click on the stage: pick the topmost clip under the pointer and start moving it
  const onStageDown = (e: React.PointerEvent) => {
    const pt = toLocal(e);
    const now = store.get();
    // hit-test against the live playhead, not the (possibly gated) render time
    for (const { clip, locked } of targetsAt(now.timeline, now.time)) {
      const b = boxOf(clip, now.time);
      if (!b) continue;
      const r = (-b.p.rotation * Math.PI) / 180;
      const dx = pt.x - b.cx, dy = pt.y - b.cy;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) {
        if (locked) store.set({ selectedClipId: clip.id });
        else startDrag(e, clip, "move");
        return;
      }
    }
    store.set({ selectedClipId: null });
  };

  const sel = active.find((a) => a.clip.id === selectedId);
  const box = sel ? boxOf(sel.clip) : null;
  const handle = "absolute h-3 w-3 rounded-sm border-2 border-primary bg-background";

  return (
    <div ref={rootRef} className="absolute inset-0" onPointerDown={onStageDown}>
      {sel && box && (
        <div
          className="absolute"
          style={{
            left: rect.left + box.cx - box.w / 2,
            top: rect.top + box.cy - box.h / 2,
            width: box.w,
            height: box.h,
            transform: `rotate(${box.p.rotation}deg)`,
          }}
        >
          <div
            className={`absolute inset-0 border-2 ${animate ? "border-destructive" : "border-primary"} ${sel.locked ? "border-dashed" : "cursor-move"}`}
            onPointerDown={(e) => (sel.locked ? e.stopPropagation() : startDrag(e, sel.clip, "move"))}
          />
          {!sel.locked && (
            <>
              <Button size="icon" variant="secondary" className="absolute -top-10 right-0 size-7" title="Delete selected element" aria-label="Delete selected element" onPointerDown={e => e.stopPropagation()} onClick={() => { store.updateTrack(store.findClip(sel.clip.id)?.track.id ?? '', tr => ({ ...tr, clips: tr.clips.filter(c => c.id !== sel.clip.id) })); store.set({ selectedClipId: null }); }}><Trash2 className="size-3.5" /></Button>
              {[
                ["-left-1.5 -top-1.5", "nwse-resize"],
                ["-right-1.5 -top-1.5", "nesw-resize"],
                ["-left-1.5 -bottom-1.5", "nesw-resize"],
                ["-right-1.5 -bottom-1.5", "nwse-resize"],
              ].map(([pos, cur]) => (
                <div key={pos} className={`${handle} ${pos}`} style={{ cursor: cur }} onPointerDown={(e) => startDrag(e, sel.clip, "scale")} aria-label="Resize" />
              ))}
              <div className="absolute -top-8 left-1/2 h-6 w-px -translate-x-1/2 bg-primary" />
              <div
                className="absolute -top-11 left-1/2 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-primary bg-background"
                onPointerDown={(e) => startDrag(e, sel.clip, "rotate")}
                aria-label="Rotate"
                title="Rotate (Shift: 15° steps)"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
