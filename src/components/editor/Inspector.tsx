import { defaultMask, type MaskProp } from "@/lib/editor/mask";
import { BLEND_MODES, type BlendMode } from "@/lib/editor/types";
import { EDITOR_FONTS } from "@/lib/editor/fonts";
import { useRef } from "react";
import { Diamond, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { type EditorStore, useEditor } from "@/lib/editor/store";
import { applyAnimated } from "@/lib/editor/keyframes";
import { FILTERS, EFFECTS } from "@/lib/editor/fx";
import { TRANSITIONS, prevAdjacent } from "@/lib/editor/transitions";
import { IN_ANIMS, LOOP_ANIMS, OUT_ANIMS, type AnimDef } from "@/lib/editor/anim";
import { SHAPES } from "@/lib/editor/shapes";
import { FADE_PRESETS } from "@/lib/editor/audio-fx";
import { SPEED_CURVES } from "@/lib/editor/presets";
import {
  type AnimRef,
  type Clip,
  type ClipAnim,
  type Effects,
  type KeyframeProp,
  type SpeedPoint,
  SPEED_MAX,
  SPEED_MIN,
  clipDuration,
  defaultEffects,
  interpolate,
  normCurve,
} from "@/lib/editor/types";
import { cn } from "@/lib/utils";

export const FONTS = [...EDITOR_FONTS, "Arial", "Georgia"];

function Row({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  store,
  suffix = "",
  kf,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  store: EditorStore;
  suffix?: string;
  kf?: { active: boolean; has: boolean; toggle: () => void };
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <span className="font-mono">
            {Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}
            {suffix}
          </span>
          {kf && (
            <button
              onClick={kf.toggle}
              className="rounded p-0.5 hover:bg-accent"
              aria-label={`Toggle ${label} keyframe`}
              title={kf.active ? "Remove keyframe at playhead" : "Add keyframe at playhead"}
            >
              <Diamond className={cn("h-3.5 w-3.5", kf.active ? "fill-primary text-primary" : kf.has ? "text-primary" : "text-muted-foreground")} />
            </button>
          )}
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        aria-label={label}
        onPointerDown={() => store.beginGesture()}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        onValueCommit={() => store.endGesture()}
      />
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Tile({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "flex min-h-9 items-center justify-center rounded-md border px-1 py-1.5 text-center text-[11px] leading-tight transition-colors",
        active ? "border-primary bg-primary/15 text-foreground" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function groups<T extends { group: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(x.group, [...(m.get(x.group) ?? []), x]);
  return [...m.entries()];
}

const TAB_LABEL: Record<string, string> = {
  basic: "Basic",
  crop: "Crop",
  composite: "Key / Mask",
  text: "Text",
  shape: "Shape",
  speed: "Speed",
  anim: "Animate",
  motion: "Motion",
  filters: "Filters",
  effects: "Effects",
  adjust: "Adjust",
  trans: "Transition",
  audio: "Audio",
};

function tabsFor(c: Clip): string[] {
  switch (c.kind) {
    case "video":
      return ["basic", "crop", "speed", "anim", "motion", "filters", "effects", "composite", "adjust", "trans", "audio"];
    case "image":
      return ["basic", "crop", "anim", "motion", "filters", "effects", "composite", "adjust", "trans"];
    case "text":
      return ["text", "anim", "motion", "effects", "adjust", "trans"];
    case "shape":
      return ["shape", "anim", "motion", "effects", "trans"];
    case "audio":
      return ["audio", "speed"];
  }
}

export function Inspector({ store, width }: { store: EditorStore; width: number }) {
  const selectedId = useEditor(store, (s) => s.selectedClipId);
  const time = useEditor(store, (s) => s.time);
  const tabPref = useEditor(store, (s) => s.inspectorTab);
  useEditor(store, (s) => s.timeline);
  const hit = store.findClip(selectedId);
  if (!hit) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Select a clip on the timeline or the preview to edit it.
        <div className="mt-6 space-y-1 text-left font-mono text-[11px]">
          <div>Space — play / pause</div>
          <div>S — split at playhead</div>
          <div>Del — delete clip</div>
          <div>Ctrl+D — duplicate</div>
          <div>Ctrl+Z / Ctrl+Shift+Z — undo / redo</div>
          <div>← → — step a frame (Shift: 1s)</div>
          <div>⋈ on the timeline — transition between clips</div>
        </div>
      </div>
    );
  }
  const c = hit.clip;
  const tabs = tabsFor(c);
  const tab = tabs.includes(tabPref) ? tabPref : tabs[0]!;
  const d = clipDuration(c);
  const local = Math.max(0, Math.min(d, time - c.start));
  const up = (fn: (c: Clip) => Clip) => store.updateClip(c.id, fn);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Input value={c.name} onChange={(e) => up((cl) => ({ ...cl, name: e.target.value }))} className="h-8 text-sm" aria-label="Clip name" />
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {c.kind} · {d.toFixed(2)}s · source {c.in.toFixed(2)}–{c.out.toFixed(2)}s
        </p>
      </div>
      <div className="flex flex-wrap gap-1 border-b p-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === tab}
            onClick={() => store.set({ inspectorTab: t })}
            className={cn("rounded px-2 py-1 text-xs", t === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3" key={c.id + tab}>
        {tab === "basic" && <BasicPanel c={c} d={d} up={up} store={store} />}
        {tab === "composite" && <CompositePanel c={c} up={up} store={store} local={local} />}
        {tab === "crop" && <CropPanel c={c} up={up} store={store} />}
        {tab === "text" && <TextPanel c={c} d={d} up={up} store={store} />}
        {tab === "shape" && <ShapePanel c={c} d={d} up={up} store={store} />}
        {tab === "speed" && <SpeedPanel c={c} up={up} store={store} />}
        {tab === "anim" && <AnimPanel c={c} d={d} up={up} store={store} />}
        {tab === "motion" && <MotionPanel c={c} local={local} up={up} store={store} width={width} />}
        {tab === "filters" && <FilterPanel c={c} up={up} store={store} />}
        {tab === "effects" && <EffectsPanel c={c} up={up} store={store} />}
        {tab === "adjust" && <AdjustPanel c={c} up={up} store={store} />}
        {tab === "trans" && <TransPanel c={c} d={d} up={up} store={store} hasPrev={!!prevAdjacent(hit.track, c)} />}
        {tab === "audio" && <AudioPanel c={c} d={d} up={up} store={store} />}
      </div>
    </div>
  );
}

type P = { c: Clip; up: (fn: (c: Clip) => Clip) => void; store: EditorStore };

function CropPanel({ c, up, store }: P) {
  const crop = c.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const set = (patch: Partial<typeof crop>) => up(cl => ({ ...cl, crop: { ...crop, ...patch } }));
  return <>
    <Row store={store} label="Crop width" value={crop.w * 100} min={10} max={(1 - crop.x) * 100} suffix="%" onChange={v => set({ w: v / 100 })} />
    <Row store={store} label="Crop height" value={crop.h * 100} min={10} max={(1 - crop.y) * 100} suffix="%" onChange={v => set({ h: v / 100 })} />
    <Row store={store} label="Crop X" value={crop.x * 100} min={0} max={(1 - crop.w) * 100} suffix="%" onChange={v => set({ x: v / 100 })} />
    <Row store={store} label="Crop Y" value={crop.y * 100} min={0} max={(1 - crop.h) * 100} suffix="%" onChange={v => set({ y: v / 100 })} />
    <Button size="sm" variant="secondary" onClick={() => up(cl => ({ ...cl, crop: undefined }))}>Reset crop</Button>
  </>;
}

function BasicPanel({ c, d, up, store }: P & { d: number }) {
  return (
    <>
      {c.kind === "image" && (
        <Row store={store} label="Duration" value={d} min={0.5} max={60} step={0.1} suffix="s" onChange={(v) => up((cl) => ({ ...cl, out: cl.in + v }))} />
      )}
      {c.kind === "video" && (
        <Row store={store} label="Volume" value={c.volume * 100} min={0} max={200} suffix="%" onChange={(v) => up((cl) => ({ ...cl, volume: v / 100 }))} />
      )}
      {(c.kind === 'video' || c.kind === 'image') && <Section title="Video fades">
        <Row store={store} label="Video fade in" value={c.visualFadeIn ?? 0} min={0} max={d} step={0.1} suffix="s" onChange={v => up(cl => ({ ...cl, visualFadeIn: v }))} />
        <Row store={store} label="Video fade out" value={c.visualFadeOut ?? 0} min={0} max={d} step={0.1} suffix="s" onChange={v => up(cl => ({ ...cl, visualFadeOut: v }))} />
      </Section>}
      {c.kind === 'video' && <Section title="Audio fades">
        <Row store={store} label="Audio fade in" value={c.fadeIn} min={0} max={d} step={0.1} suffix="s" onChange={v => up(cl => ({ ...cl, fadeIn: v }))} />
        <Row store={store} label="Audio fade out" value={c.fadeOut} min={0} max={d} step={0.1} suffix="s" onChange={v => up(cl => ({ ...cl, fadeOut: v }))} />
      </Section>}
      <Section title="Quick looks">
        <div className="grid grid-cols-3 gap-1">
          {FILTERS.slice(0, 6).map((f) => (
            <Tile key={f.id} active={c.filter?.id === f.id} onClick={() => up((cl) => ({ ...cl, filter: cl.filter?.id === f.id ? undefined : { id: f.id, intensity: 80 } }))}>
              {f.name}
            </Tile>
          ))}
        </div>
      </Section>
      <p className="text-[11px] text-muted-foreground">
        Drag on the preview to move, use the corners to resize and the round handle to rotate. More in Motion, Filters, Effects and Transition.
      </p>
    </>
  );
}

function TextPanel({ c, d, up, store }: P & { d: number }) {
  if (!c.text) return null;
  const t = c.text;
  const setT = (patch: Partial<typeof t>) => up((cl) => ({ ...cl, text: { ...cl.text!, ...patch } }));
  return (
    <>
      <Textarea value={t.content} rows={3} aria-label="Text content" onChange={(e) => setT({ content: e.target.value })} />
      <Select value={t.fontFamily} onValueChange={(v) => setT({ fontFamily: v })}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {FONTS.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Row store={store} label="Size" value={t.fontSize} min={16} max={400} onChange={(v) => setT({ fontSize: v })} />
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">Color</span>
          <Input type="color" className="h-8 p-1" value={t.color} onChange={(e) => setT({ color: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Outline</span>
          <Input type="color" className="h-8 p-1" value={t.stroke} onChange={(e) => setT({ stroke: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Glow</span>
          <Input type="color" className="h-8 p-1" value={t.glowColor ?? "#ffffff"} onChange={(e) => setT({ glowColor: e.target.value, glowSize: t.glowSize || 20 })} />
        </label>
      </div>
      <Row store={store} label="Outline width" value={t.strokeWidth} min={0} max={20} onChange={(v) => setT({ strokeWidth: v })} />
      <Row store={store} label="Glow size" value={t.glowSize ?? 0} min={0} max={60} onChange={(v) => setT({ glowSize: v, glowColor: t.glowColor ?? "#ffffff" })} />
      <Row store={store} label="Letter spacing" value={t.letterSpacing ?? 0} min={-10} max={60} onChange={(v) => setT({ letterSpacing: v })} />
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Background box</span>
        <Switch checked={!!t.background} onCheckedChange={(on) => setT({ background: on ? "rgba(0,0,0,0.6)" : "" })} />
      </div>
      {t.background && (
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Box color</span>
          <Input type="color" className="h-8 p-1" value={t.background.startsWith("#") ? t.background : "#000000"} onChange={(e) => setT({ background: e.target.value })} />
        </label>
      )}
      <div className="flex gap-1">
        <Button size="sm" variant={t.bold ? "default" : "secondary"} onClick={() => setT({ bold: !t.bold })}>B</Button>
        <Button size="sm" variant={t.italic ? "default" : "secondary"} className="italic" onClick={() => setT({ italic: !t.italic })}>I</Button>
        {(["left", "center", "right"] as const).map((a) => (
          <Button key={a} size="sm" variant={t.align === a ? "default" : "secondary"} onClick={() => setT({ align: a })}>
            {a.charAt(0).toUpperCase()}
          </Button>
        ))}
      </div>
      <Row store={store} label="Duration" value={d} min={0.5} max={60} step={0.1} suffix="s" onChange={(v) => up((cl) => ({ ...cl, out: cl.in + v }))} />
    </>
  );
}

function ShapePanel({ c, d, up, store }: P & { d: number }) {
  if (!c.shape) return null;
  const s = c.shape;
  const setS = (patch: Partial<typeof s>) => up((cl) => ({ ...cl, shape: { ...cl.shape!, ...patch } }));
  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {SHAPES.map((sh) => (
          <Tile key={sh.id} active={s.type === sh.id} onClick={() => setS({ type: sh.id })}>{sh.name}</Tile>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="space-y-1">
          <span className="text-muted-foreground">Fill</span>
          <Input type="color" className="h-8 p-1" value={s.fill} onChange={(e) => setS({ fill: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Outline</span>
          <Input type="color" className="h-8 p-1" value={s.stroke} onChange={(e) => setS({ stroke: e.target.value })} />
        </label>
      </div>
      <Row store={store} label="Outline width" value={s.strokeWidth} min={0} max={40} onChange={(v) => setS({ strokeWidth: v })} />
      <Row store={store} label="Width" value={s.w} min={10} max={2000} onChange={(v) => setS({ w: v })} />
      <Row store={store} label="Height" value={s.h} min={10} max={2000} onChange={(v) => setS({ h: v })} />
      <Row store={store} label="Duration" value={d} min={0.5} max={60} step={0.1} suffix="s" onChange={(v) => up((cl) => ({ ...cl, out: cl.in + v }))} />
    </>
  );
}

function SpeedPanel({ c, up, store }: P) {
  const curve = normCurve(c.speedCurve);
  return (
    <>
      <Section title="Normal">
        <Row
          store={store}
          label="Speed"
          value={c.speed}
          min={0.1}
          max={10}
          step={0.05}
          suffix="x"
          onChange={(v) => up((cl) => ({ ...cl, speed: Math.round(v * 100) / 100 }))}
        />
        <div className="flex flex-wrap gap-1">
          {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
            <Button key={s} size="sm" variant={c.speed === s ? "default" : "secondary"} onClick={() => up((cl) => ({ ...cl, speed: s }))}>
              {s}x
            </Button>
          ))}
        </div>
      </Section>
      <Section
        title="Curve"
        action={
          curve && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => up((cl) => ({ ...cl, speedCurve: undefined }))}>
              Remove
            </Button>
          )
        }
      >
        <div className="grid grid-cols-4 gap-1">
          <Tile
            active={false}
            onClick={() => up((cl) => ({ ...cl, speedCurve: [{ t: 0, speed: 1 }, { t: 0.5, speed: 1 }, { t: 1, speed: 1 }] }))}
            title="Start a custom curve"
          >
            Custom
          </Tile>
          {SPEED_CURVES.map((p) => (
            <Tile key={p.id} active={JSON.stringify(c.speedCurve) === JSON.stringify(p.pts)} onClick={() => up((cl) => ({ ...cl, speedCurve: p.pts }))}>
              {p.name}
            </Tile>
          ))}
        </div>
        {curve && <CurveEditor curve={curve} onChange={(pts) => up((cl) => ({ ...cl, speedCurve: pts }))} store={store} />}
        <p className="text-[11px] text-muted-foreground">
          Drag points up for faster, down for slower. Double-click to add a point, right-click to remove. The clip length updates to match.
        </p>
      </Section>
    </>
  );
}

const W_SVG = 280, H_SVG = 120;
const toY = (s: number) => H_SVG - ((Math.log(s) - Math.log(SPEED_MIN)) / (Math.log(SPEED_MAX) - Math.log(SPEED_MIN))) * H_SVG;
const fromY = (y: number) => Math.exp(Math.log(SPEED_MIN) + (1 - y / H_SVG) * (Math.log(SPEED_MAX) - Math.log(SPEED_MIN)));

function CurveEditor({ curve, onChange, store }: { curve: SpeedPoint[]; onChange: (p: SpeedPoint[]) => void; store: EditorStore }) {
  const ref = useRef<SVGSVGElement>(null);
  const pt = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { t: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(H_SVG, Math.max(0, ((e.clientY - r.top) / r.height) * H_SVG)) };
  };
  const drag = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    store.beginGesture();
    const move = (ev: PointerEvent) => {
      const p = pt(ev);
      const next = curve.map((q, j) => {
        if (j !== i) return q;
        const lo = j === 0 ? 0 : curve[j - 1]!.t + 0.02;
        const hi = j === curve.length - 1 ? 1 : curve[j + 1]!.t - 0.02;
        const t = j === 0 ? 0 : j === curve.length - 1 ? 1 : Math.min(hi, Math.max(lo, p.t));
        return { t, speed: Math.round(fromY(p.y) * 100) / 100 };
      });
      onChange(next);
    };
    const upH = () => {
      store.endGesture();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", upH);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", upH);
  };
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W_SVG} ${H_SVG}`}
      className="h-32 w-full touch-none rounded-md border bg-background"
      aria-label="Speed curve editor"
      onDoubleClick={(e) => {
        const p = pt(e);
        onChange([...curve, { t: p.t, speed: Math.round(fromY(p.y) * 100) / 100 }].sort((a, b) => a.t - b.t));
      }}
    >
      <line x1={0} x2={W_SVG} y1={toY(1)} y2={toY(1)} className="stroke-border" strokeDasharray="4 3" />
      <text x={4} y={toY(1) - 3} className="fill-muted-foreground text-[9px]">1x</text>
      <text x={4} y={10} className="fill-muted-foreground text-[9px]">10x</text>
      <text x={4} y={H_SVG - 3} className="fill-muted-foreground text-[9px]">0.1x</text>
      <polyline fill="none" className="stroke-primary" strokeWidth={2} points={curve.map((p) => `${p.t * W_SVG},${toY(p.speed)}`).join(" ")} />
      {curve.map((p, i) => (
        <circle
          key={i}
          cx={p.t * W_SVG}
          cy={toY(p.speed)}
          r={6}
          className="cursor-ns-resize fill-background stroke-primary"
          strokeWidth={2}
          onPointerDown={drag(i)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (i > 0 && i < curve.length - 1) onChange(curve.filter((_, j) => j !== i));
          }}
        >
          <title>{p.speed.toFixed(2)}x</title>
        </circle>
      ))}
    </svg>
  );
}

function AnimPanel({ c, d, up, store }: P & { d: number }) {
  const setA = (key: keyof ClipAnim, v: AnimRef | undefined) => up((cl) => ({ ...cl, anim: { ...cl.anim, [key]: v } }));
  const block = (key: keyof ClipAnim, title: string, list: AnimDef[], defDur: number) => {
    const cur = c.anim?.[key];
    return (
      <Section title={title}>
        <div className="grid grid-cols-3 gap-1">
          <Tile active={!cur} onClick={() => setA(key, undefined)}>None</Tile>
          {list
            .filter((a) => !a.textOnly || c.kind === "text")
            .map((a) => (
              <Tile key={a.id} active={cur?.id === a.id} onClick={() => setA(key, { id: a.id, duration: cur?.duration ?? defDur })}>
                {a.name}
              </Tile>
            ))}
        </div>
        {cur && (
          <Row
            store={store}
            label={key === "loop" ? "Speed (period)" : "Duration"}
            value={cur.duration}
            min={0.1}
            max={key === "loop" ? 5 : Math.max(0.2, Math.min(5, d))}
            step={0.05}
            suffix="s"
            onChange={(v) => setA(key, { ...cur, duration: v })}
          />
        )}
      </Section>
    );
  };
  return (
    <>
      {block("in", "In", IN_ANIMS, Math.min(0.6, d / 2))}
      {block("out", "Out", OUT_ANIMS, Math.min(0.6, d / 2))}
      {block("loop", "Combo / loop", LOOP_ANIMS, 1)}
    </>
  );
}

function MotionPanel({ c, local, up, store, width }: P & { local: number; width: number }) {
  const EPS = 1 / 60;
  const kfValue = (p: KeyframeProp) => interpolate(c.keyframes[p], local, c.transform[p]);
  const kfAt = (p: KeyframeProp) => c.keyframes[p]?.find((k) => Math.abs(k.t - local) < EPS);
  const setProp = (p: KeyframeProp, v: number) => up((cl) => applyAnimated(cl, local, { [p]: v }, store.get().animate));
  const toggleKf = (p: KeyframeProp) =>
    up((cl) => {
      const arr = cl.keyframes[p] ?? [];
      const exists = arr.some((k) => Math.abs(k.t - local) < EPS);
      const next = exists ? arr.filter((k) => Math.abs(k.t - local) >= EPS) : [...arr, { t: local, value: kfValue(p) }];
      return { ...cl, keyframes: { ...cl.keyframes, [p]: next } };
    });
  const kfProps = (p: KeyframeProp) => ({ active: !!kfAt(p), has: !!c.keyframes[p]?.length, toggle: () => toggleKf(p) });
  const allKf = (Object.entries(c.keyframes) as [KeyframeProp, { t: number; value: number }[]][]).flatMap(([p, arr]) => arr.map((k) => ({ p, ...k })));
  const d = clipDuration(c);
  const preset = (name: string) =>
    up((cl) => {
      const t = cl.transform;
      const kf: Clip["keyframes"] = {};
      if (name === "zoom-in") kf.scale = [{ t: 0, value: t.scale }, { t: d, value: t.scale * 1.3 }];
      if (name === "zoom-out") kf.scale = [{ t: 0, value: t.scale * 1.3 }, { t: d, value: t.scale }];
      if (name === "pan-left") {
        kf.scale = [{ t: 0, value: Math.max(1.2, t.scale) }];
        kf.x = [{ t: 0, value: width * 0.08 }, { t: d, value: -width * 0.08 }];
      }
      if (name === "pan-right") {
        kf.scale = [{ t: 0, value: Math.max(1.2, t.scale) }];
        kf.x = [{ t: 0, value: -width * 0.08 }, { t: d, value: width * 0.08 }];
      }
      if (name === "ken-burns") {
        kf.scale = [{ t: 0, value: 1 }, { t: d, value: 1.25 }];
        kf.x = [{ t: 0, value: 0 }, { t: d, value: width * 0.05 }];
        kf.y = [{ t: 0, value: 0 }, { t: d, value: -width * 0.03 }];
      }
      if (name === "rotate") kf.rotation = [{ t: 0, value: 0 }, { t: d, value: 360 }];
      return { ...cl, keyframes: { ...cl.keyframes, ...kf } };
    });
  return (
    <>
      <Section title="Motion presets">
        <div className="grid grid-cols-3 gap-1">
          {[
            ["zoom-in", "Slow zoom in"],
            ["zoom-out", "Slow zoom out"],
            ["ken-burns", "Ken Burns"],
            ["pan-left", "Pan left"],
            ["pan-right", "Pan right"],
            ["rotate", "Full spin"],
          ].map(([id, n]) => (
            <Tile key={id} active={false} onClick={() => preset(id!)}>{n}</Tile>
          ))}
        </div>
      </Section>
      <p className="text-[11px] text-muted-foreground">Click ◆ to add a keyframe at the playhead. Once a property has keyframes, changes at the playhead edit or add keyframes.</p>
      <Row store={store} label="Position X" value={kfValue("x")} min={-width} max={width} onChange={(v) => setProp("x", v)} kf={kfProps("x")} />
      <Row store={store} label="Position Y" value={kfValue("y")} min={-width} max={width} onChange={(v) => setProp("y", v)} kf={kfProps("y")} />
      <Row store={store} label="Scale" value={kfValue("scale")} min={0.1} max={4} step={0.01} onChange={(v) => setProp("scale", v)} kf={kfProps("scale")} />
      <Row store={store} label="Rotation" value={kfValue("rotation")} min={-360} max={360} suffix="°" onChange={(v) => setProp("rotation", v)} kf={kfProps("rotation")} />
      <Row store={store} label="Opacity" value={kfValue("opacity") * 100} min={0} max={100} suffix="%" onChange={(v) => setProp("opacity", v / 100)} kf={kfProps("opacity")} />
      {allKf.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Keyframes</div>
          {allKf
            .sort((a, b) => a.t - b.t)
            .map((k, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-secondary px-2 py-1 font-mono text-[11px]">
                <button className="flex-1 text-left" onClick={() => store.set({ time: c.start + k.t, playing: false })}>
                  {k.p} @ {k.t.toFixed(2)}s = {k.value.toFixed(2)}
                </button>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete keyframe"
                  onClick={() => up((cl) => ({ ...cl, keyframes: { ...cl.keyframes, [k.p]: cl.keyframes[k.p]!.filter((x) => x.t !== k.t) } }))}
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={() => up((cl) => ({ ...cl, keyframes: {}, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 } }))}>
        Reset motion
      </Button>
    </>
  );
}

function FilterPanel({ c, up, store }: P) {
  return (
    <>
      {c.filter && (
        <Row store={store} label="Intensity" value={c.filter.intensity} min={0} max={100} suffix="%" onChange={(v) => up((cl) => ({ ...cl, filter: { ...cl.filter!, intensity: v } }))} />
      )}
      <Tile active={!c.filter} onClick={() => up((cl) => ({ ...cl, filter: undefined }))}>No filter</Tile>
      {groups(FILTERS).map(([g, list]) => (
        <Section key={g} title={g}>
          <div className="grid grid-cols-3 gap-1.5">
            {list.map((f) => (
              <button
                key={f.id}
                aria-pressed={c.filter?.id === f.id}
                onClick={() => up((cl) => ({ ...cl, filter: { id: f.id, intensity: cl.filter?.intensity ?? 100 } }))}
                className={cn("overflow-hidden rounded-md border text-[11px]", c.filter?.id === f.id ? "border-primary ring-1 ring-primary" : "border-border")}
              >
                <div className="h-8" style={{ background: f.swatch }} />
                <div className="truncate px-1 py-0.5">{f.name}</div>
              </button>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

function EffectsPanel({ c, up, store }: P) {
  const fx = c.fx ?? [];
  const toggle = (id: string) =>
    up((cl) => {
      const cur = cl.fx ?? [];
      return { ...cl, fx: cur.some((f) => f.id === id) ? cur.filter((f) => f.id !== id) : [...cur, { id, intensity: id === "bg-remove" ? 100 : 60 }] };
    });
  return (
    <>
      {fx.length > 0 && (
        <Section title="Applied">
          {fx.map((f) => (
            <div key={f.id} className="space-y-1 rounded-md border p-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{EFFECTS.find((e) => e.id === f.id)?.name ?? f.id}</span>
                <button onClick={() => toggle(f.id)} aria-label="Remove effect" className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Row
                store={store}
                label="Intensity"
                value={f.intensity}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => up((cl) => ({ ...cl, fx: (cl.fx ?? []).map((x) => (x.id === f.id ? { ...x, intensity: v } : x)) }))}
              />
              <Row store={store} label="Speed" value={f.speed ?? 1} min={0.1} max={4} step={0.1} suffix="×" onChange={v => up(cl => ({ ...cl, fx: (cl.fx ?? []).map(x => x.id === f.id ? { ...x, speed: v } : x) }))} />
              <Row store={store} label="Blend" value={f.blend ?? 100} min={0} max={100} suffix="%" onChange={v => up(cl => ({ ...cl, fx: (cl.fx ?? []).map(x => x.id === f.id ? { ...x, blend: v } : x) }))} />
            </div>
          ))}
        </Section>
      )}
      {groups(EFFECTS.filter(e => e.group !== 'AI portrait')).map(([g, list]) => (
        <Section key={g} title={g}>
          <div className="grid grid-cols-3 gap-1">
            {list.map((e) => (
              <Tile key={e.id} active={fx.some((f) => f.id === e.id)} onClick={() => toggle(e.id)}>{e.name}</Tile>
            ))}
          </div>
          {g === "AI portrait" && (
            <p className="text-[11px] text-muted-foreground">
              Finds the person in each frame on your device. The first use downloads a small model, so the effect appears after a few seconds.
            </p>
          )}
        </Section>
      ))}
    </>
  );
}

export function AdjustPanel({ c, up, store }: P) {
  const rows: [keyof Effects, string, number, number, string, number][] = [
    ["whites", "Whites", -100, 100, "", 0],
    ["blacks", "Blacks", -100, 100, "", 0],
    ["vibrance", "Vibrance", -100, 100, "", 0],
    ["clarity", "Clarity", 0, 100, "", 0],
    ["grain", "Grain", 0, 100, "", 0],
    ["fade", "Fade", 0, 100, "", 0],
    ["brightness", "Brightness", 0, 200, "%", 100],
    ["contrast", "Contrast", 0, 200, "%", 100],
    ["saturation", "Saturation", 0, 300, "%", 100],
    ["exposure", "Exposure", -3, 3, " EV", 0],
    ["highlights", "Highlights", -100, 100, "", 0],
    ["shadows", "Shadows", -100, 100, "", 0],
    ["sharpen", "Sharpen", 0, 100, "%", 0],
    ["vignette", "Vignette", 0, 100, "%", 0],
    ["temperature", "Temperature", -100, 100, "", 0],
    ["tint", "Tint", -100, 100, "", 0],
    ["hue", "Hue", -180, 180, "°", 0],
    ["blur", "Blur", 0, 30, "px", 0],
    ["grayscale", "Grayscale", 0, 100, "%", 0],
    ["sepia", "Sepia", 0, 100, "%", 0],
    ["invert", "Invert", 0, 100, "%", 0],
  ];
  return (
    <>
      {(["Basic", "Light", "Color", "Detail"] as const).map(group => <Section key={group} title={group}>{rows.filter(([k]) => {
        const g = ["brightness","contrast","saturation"].includes(k) ? "Basic" : ["exposure","highlights","shadows","whites","blacks"].includes(k) ? "Light" : ["temperature","tint","hue","vibrance","sepia","grayscale","invert"].includes(k) ? "Color" : "Detail"; return g === group;
      }).map(([k, label, min, max, suffix, def]) => (
        <Row
          key={k}
          store={store}
          label={label}
          value={(c.effects[k] as number | undefined) ?? def}
          min={min}
          max={max}
          suffix={suffix}
          step={k === "exposure" ? 0.1 : 1}
          onChange={(v) => up((cl) => ({ ...cl, effects: { ...cl.effects, [k]: v } }))}
        />
      ))}
      </Section>)}
      <Button size="sm" variant="secondary" onClick={() => up((cl) => ({ ...cl, effects: defaultEffects() }))}>Reset adjustments</Button>
    </>
  );
}

function TransPanel({ c, d, up, store, hasPrev }: P & { d: number; hasPrev: boolean }) {
  const block = (key: "transitionIn" | "transitionOut", title: string, hint: string) => {
    const tr = c[key];
    return (
      <Section title={title}>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
        <div className="grid grid-cols-3 gap-1">
          <Tile active={!tr} onClick={() => up((cl) => ({ ...cl, [key]: undefined }))}>None</Tile>
          {TRANSITIONS.map((t) => (
            <Tile
              key={t.id}
              active={tr?.type === t.id}
              onClick={() => up((cl) => ({ ...cl, [key]: { type: t.id, duration: cl[key]?.duration ?? Math.min(0.8, d / 2) } }))}
            >
              {t.name}
            </Tile>
          ))}
        </div>
        {tr && (
          <Row
            store={store}
            label="Duration"
            value={tr.duration}
            min={0.1}
            max={Math.max(0.2, Math.min(5, d))}
            step={0.05}
            suffix="s"
            onChange={(v) => up((cl) => ({ ...cl, [key]: { ...cl[key]!, duration: v } }))}
          />
        )}
      </Section>
    );
  };
  return (
    <>
      {block(
        "transitionIn",
        hasPrev ? "Transition from previous clip" : "In transition",
        hasPrev ? "Blends the clip before this one into this clip." : "Reveals this clip over whatever is below it (black on the bottom track).",
      )}
      {block("transitionOut", "Out transition", "Plays at the end of this clip when nothing transitions in after it.")}
    </>
  );
}

function AudioPanel({ c, d, up, store }: P & { d: number }) {
  return (
    <>
      <Row store={store} label="Volume" value={c.volume * 100} min={0} max={200} suffix="%" onChange={(v) => up((cl) => ({ ...cl, volume: v / 100 }))} />
      <Section title="Fade presets">
        <div className="grid grid-cols-3 gap-1">
          {FADE_PRESETS.map((p) => (
            <Tile
              key={p.name}
              active={c.fadeIn === Math.min(p.fadeIn, d / 2) && c.fadeOut === Math.min(p.fadeOut, d / 2)}
              onClick={() => up((cl) => ({ ...cl, fadeIn: Math.min(p.fadeIn, d / 2), fadeOut: Math.min(p.fadeOut, d / 2) }))}
            >
              {p.name}
            </Tile>
          ))}
        </div>
      </Section>
      <Row store={store} label="Fade in" value={c.fadeIn} min={0} max={Math.min(10, d)} step={0.1} suffix="s" onChange={(v) => up((cl) => ({ ...cl, fadeIn: v }))} />
      <Row store={store} label="Fade out" value={c.fadeOut} min={0} max={Math.min(10, d)} step={0.1} suffix="s" onChange={(v) => up((cl) => ({ ...cl, fadeOut: v }))} />
      <Section title="Ducking">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Lower this clip while other audio plays</span>
          <Switch checked={!!c.duck} aria-label="Ducking" onCheckedChange={(on) => up((cl) => ({ ...cl, duck: on ? 0.7 : undefined }))} />
        </div>
        {!!c.duck && (
          <Row store={store} label="Duck amount" value={c.duck * 100} min={10} max={100} suffix="%" onChange={(v) => up((cl) => ({ ...cl, duck: v / 100 }))} />
        )}
        <p className="text-[11px] text-muted-foreground">Use on background music: it dips automatically whenever a voice or video clip with sound plays.</p>
      </Section>
    </>
  );
}

function CompositePanel({ c, up, store, local }: P & { local: number }) {
  const key = c.chroma ?? { enabled: false, color: '#00ff00', tolerance: .15, softness: .1, spill: .5 };
  const setKey = (patch: Partial<typeof key>) => up(cl => ({ ...cl, chroma: { ...(cl.chroma ?? key), ...patch } }));
  const m = c.mask ?? defaultMask();
  const setMask = (patch: Partial<typeof m>) => up(cl => ({ ...cl, mask: { ...(cl.mask ?? m), ...patch } }));
  const pick = () => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    document.addEventListener('keydown', cancel, { once: true, signal: controller.signal });
    document.addEventListener('pointerdown', e => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-preview]');
      if (!canvas) return cancel();
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return cancel();
      e.preventDefault(); e.stopImmediatePropagation();
      const d = canvas.getContext('2d')!.getImageData(Math.min(canvas.width-1,Math.floor((e.clientX-r.left)*canvas.width/r.width)),Math.min(canvas.height-1,Math.floor((e.clientY-r.top)*canvas.height/r.height)),1,1).data;
      setKey({ color: '#' + Array.from(d.slice(0,3)).map(v => v.toString(16).padStart(2,'0')).join(''), enabled: true }); cancel();
    }, { capture: true, once: true, signal: controller.signal });
  };
  return <>
    <Section title="Blend"><select aria-label="Blend mode" className="w-full bg-background" value={c.blend ?? 'normal'} onChange={e => up(cl => ({...cl,blend:e.target.value === 'normal' ? undefined : e.target.value as BlendMode}))}><option value="normal">Normal</option>{BLEND_MODES.map(b=><option key={b}>{b}</option>)}</select></Section>
    <Section title="Chroma key"><Switch aria-label="Enable chroma key" checked={key.enabled} onCheckedChange={enabled=>setKey({enabled})}/><Input type="color" aria-label="Key color" value={key.color} onChange={e=>setKey({color:e.target.value})}/><Button variant="secondary" size="sm" onClick={pick}>Pick color from preview</Button><p className="text-xs text-muted-foreground">Click preview to sample; Escape cancels.</p>{(['tolerance','softness','spill'] as const).map(p=><Row key={p} label={p} store={store} value={key[p]} min={0} max={1} step={.01} onChange={v=>setKey({[p]:v})}/>)}</Section>
    <Section title="Mask"><select aria-label="Mask type" className="w-full bg-background" value={c.mask?.type ?? 'none'} onChange={e=>e.target.value==='none'?up(cl=>({...cl,mask:undefined})):setMask({type:e.target.value as typeof m.type})}><option value="none">None</option>{['linear','mirror','circle','rect','heart','star'].map(t=><option key={t}>{t}</option>)}</select>
    {c.mask && <><label className="flex justify-between text-xs">Invert<Switch checked={m.invert} onCheckedChange={invert=>setMask({invert})}/></label>{(['x','y','w','h','rotation','feather'] as MaskProp[]).map(p=>{
      const arr=m.keyframes?.[p] ?? []; const active=arr.some(k=>Math.abs(k.t-local)<1/60);
      const change=(v:number)=> { if(arr.length) setMask({keyframes:{...m.keyframes,[p]:[...arr.filter(k=>Math.abs(k.t-local)>=1/60),{t:local,value:v}]}}); else setMask({[p]:v}); };
      return <Row key={p} label={'Mask '+p} store={store} value={interpolate(arr,local,m[p])} min={p==='rotation'?-180:0} max={p==='rotation'?180:p==='feather'?.3:1} step={p==='rotation'?1:.01} onChange={change} kf={{active,has:!!arr.length,toggle:()=>setMask({keyframes:{...m.keyframes,[p]:active?arr.filter(k=>Math.abs(k.t-local)>=1/60):[...arr,{t:local,value:interpolate(arr,local,m[p])}]}})}}/>;
    })}<Row label="Corner radius" store={store} value={m.radius} min={0} max={.5} step={.01} onChange={radius=>setMask({radius})}/></>}
    </Section>
  </>;
}
