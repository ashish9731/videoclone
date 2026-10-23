import { useRef, useState } from "react";
import { Captions, Download, Eye, EyeOff, FileUp, Languages, Plus, Sparkles, Trash2, Type, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type EditorStore, useEditor } from "@/lib/editor/store";
import { transcribeTimeline } from "@/lib/editor/transcribe-client";
import { translateCues } from "@/lib/ai.functions";
import {
  type CaptionCue,
  type CaptionTrack,
  type MediaAsset,
  LANGUAGES,
  cuesToSrt,
  defaultCaptionStyle,
  formatTime,
  languageName,
  parseSubtitles,
  textClip,
  uid,
} from "@/lib/editor/types";
import { FONTS } from "./Inspector";
import { ProChip } from "./ProChip";
import { announcePro, proLocked, PRO_COPY } from "@/lib/pro-gate";
import { cn } from "@/lib/utils";
import { editCue } from '@/lib/editor/caption-edit';
import { addClipToTimeline } from '@/lib/editor/placement';

interface Props {
  store: EditorStore;
  assets: Map<string, MediaAsset>;
  tracks: CaptionTrack[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  createTrack: (t: Omit<CaptionTrack, "id" | "project_id">) => Promise<CaptionTrack | null>;
  updateTrack: (id: string, fn: (t: CaptionTrack) => CaptionTrack) => void;
  deleteTrack: (id: string) => void;
}

export function CaptionsPanel({ store, assets, tracks, activeId, setActiveId, createTrack, updateTrack, deleteTrack }: Props) {
  const [job, setJob] = useState<{ p: number; label: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [target, setTarget] = useState("es");
  const translate = useServerFn(translateCues);
  const active = tracks.find((t) => t.id === activeId) ?? null;
  // Subscribe to the cue under the playhead, not to the raw time: this list can hold hundreds of
  // rows and re-rendering it on every playhead tick is what made playback stutter with captions.
  const currentCueId = useEditor(store, (s) => {
    for (const cue of active?.cues ?? []) if (s.time >= cue.start && s.time < cue.end) return cue.id;
    return "";
  });

  const generate = async () => {
    // speech-to-text is a service this build does not ship: say so instead of starting a job that
    // cannot finish. The pipeline below stays wired for the day the Pro flag flips.
    if (proLocked("autoCaptions")) {
      announcePro("autoCaptions");
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setJob({ p: 0, label: "Preparing audio" });
    try {
      const cues = await transcribeTimeline(store.get().timeline, assets, undefined, (p, label) => setJob({ p, label }), ac.signal);
      const t = await createTrack({ name: "Auto captions", language: "auto", cues, style: defaultCaptionStyle(), visible: true });
      if (t) setActiveId(t.id);
      toast.success(`Created ${cues.length} captions`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setJob(null);
    }
  };

  const runTranslate = async () => {
    if (proLocked("captionTranslate")) {
      announcePro("captionTranslate");
      return;
    }
    if (!active || !active.cues.length) return;
    const ac = new AbortController();
    abortRef.current = ac;
    const name = languageName(target);
    setJob({ p: 0, label: `Translating to ${name}` });
    try {
      const out: CaptionCue[] = [];
      const B = 60;
      for (let i = 0; i < active.cues.length; i += B) {
        if (ac.signal.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
        const batch = active.cues.slice(i, i + B);
        const res = await translate({ data: { target: name, cues: batch.map((c) => ({ id: c.id, text: c.text })) } });
        const map = new Map(res.map((r) => [r.id, r.text]));
        for (const c of batch) out.push({ ...c, id: uid(), text: map.get(c.id) ?? c.text });
        setJob({ p: Math.min(1, (i + B) / active.cues.length), label: `Translating to ${name}` });
      }
      const t = await createTrack({
        name: `${name} captions`,
        language: target,
        cues: out,
        style: active.style,
        visible: true,
      });
      updateTrack(active.id, (x) => ({ ...x, visible: false }));
      if (t) setActiveId(t.id);
      toast.success(`Translated to ${name}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message || "Translation failed");
    } finally {
      setJob(null);
    }
  };

  const setCue = (id: string, patch: Partial<CaptionCue>) =>
    active && updateTrack(active.id, (t) => ({ ...t, cues: t.cues.map((c) => (c.id === id ? editCue(c, patch) : c)) }));

  const convertCue = (cue: CaptionCue) => {
    if (!active) return;
    const clip = textClip(cue.start);
    clip.out = cue.end - cue.start;
    clip.name = cue.text || 'Caption';
    if (clip.text) clip.text = { ...clip.text, ...active.style, content: active.style.uppercase ? cue.text.toUpperCase() : cue.text };
    clip.transform.y = (active.style.position - 0.5) * 1080;
    addClipToTimeline(store, clip);
    updateTrack(active.id, t => ({ ...t, cues: t.cues.filter(c => c.id !== cue.id) }));
  };

  const addCue = () =>
    active &&
    updateTrack(active.id, (t) => ({
      ...t,
      cues: [...t.cues, { id: uid(), start: store.get().time, end: store.get().time + 2, text: "" }].sort((a, b) => a.start - b.start),
    }));

  const downloadSrt = () => {
    if (!active) return;
    const blob = new Blob([cuesToSrt(active.cues)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${active.name}.srt`;
    a.click();
  };

  const importSubtitles = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const cues = parseSubtitles(text);
      if (!cues.length) {
        toast.error("No captions found in that file. Use a .srt or .vtt subtitle file.");
        return;
      }
      const name = file.name.replace(/\.(srt|vtt)$/i, "") || "Imported";
      const t = await createTrack({ name: `${name} captions`, language: "auto", cues, style: defaultCaptionStyle(), visible: true });
      if (t) {
        setActiveId(t.id);
        store.set({ time: cues[0]!.start, playing: false });
      }
      toast.success(`Imported ${cues.length} captions from ${file.name}`);
    } catch (e) {
      toast.error((e as Error).message || "Could not read that file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const style = active?.style;
  const setStyle = (patch: Partial<CaptionTrack["style"]>) =>
    active && updateTrack(active.id, (t) => ({ ...t, style: { ...t.style, ...patch } }));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <Button className="w-full" onClick={generate} disabled={!!job}>
          <Sparkles className="mr-2 h-4 w-4" /> Auto-generate captions
          {proLocked("autoCaptions") && <ProChip className="ml-2" title={PRO_COPY.autoCaptions.title} />}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {proLocked("autoCaptions")
            ? PRO_COPY.autoCaptions.title
            : "Transcribes the spoken audio on your timeline into timed captions."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const t = await createTrack({ name: "Manual captions", language: "en", cues: [], style: defaultCaptionStyle(), visible: true });
              if (t) setActiveId(t.id);
              toast("Add cues at the playhead and type your text.");
            }}
          >
            <Type className="mr-1 h-3.5 w-3.5" /> Manual captions
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileUp className="mr-1 h-3.5 w-3.5" /> Import .srt / .vtt
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".srt,.vtt,text/plain"
          className="hidden"
          aria-label="Import subtitle file"
          onChange={(e) => importSubtitles(e.target.files?.[0])}
        />
        {job && (
          <div className="rounded-md bg-secondary p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate">{job.label}</span>
              <button onClick={() => abortRef.current?.abort()} aria-label="Cancel"><X className="h-3.5 w-3.5" /></button>
            </div>
            <Progress value={job.p * 100} className="mt-1.5 h-1" />
          </div>
        )}
      </div>

      <div className="space-y-1 border-b p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Caption tracks</span>
          <Button
            size="sm"
            aria-label="Add caption track"
            variant="ghost"
            className="h-7"
            onClick={async () => {
              const t = await createTrack({ name: "Captions", language: "en", cues: [], style: defaultCaptionStyle(), visible: true });
              if (t) setActiveId(t.id);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {tracks.length === 0 && <p className="text-[11px] text-muted-foreground">No captions yet.</p>}
        {tracks.map((t) => (
          <div
            key={t.id}
            className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs", t.id === activeId ? "bg-primary/15" : "hover:bg-accent")}
            onClick={() => setActiveId(t.id)}
          >
            <Captions className="h-3.5 w-3.5 text-primary" />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{t.cues.length}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTrack(t.id, (x) => ({ ...x, visible: !x.visible }));
              }}
              aria-label="Toggle visibility"
              title="Visible tracks are shown and burned into exports"
            >
              {t.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${t.name}"?`)) deleteTrack(t.id);
              }}
              aria-label="Delete caption track"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>

      {active && style && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 border-b p-3">
            <Input value={active.name} className="h-8" onChange={(e) => updateTrack(active.id, (t) => ({ ...t, name: e.target.value }))} />
            <div className="flex gap-1">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={runTranslate} disabled={!!job || !active.cues.length}>
                <Languages className="mr-1 h-3.5 w-3.5" /> Translate
                {proLocked("captionTranslate") && <ProChip className="ml-1.5" title={PRO_COPY.captionTranslate.title} />}
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="w-full" onClick={downloadSrt} disabled={!active.cues.length}>
              <Download className="mr-1 h-3.5 w-3.5" /> Download .srt
            </Button>
          </div>

          <details className="border-b p-3">
            <summary className="cursor-pointer text-xs font-medium">Style</summary>
            <div className="mt-3 space-y-3">
              <Select value={style.fontFamily} onValueChange={(v) => setStyle({ fontFamily: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONTS.map((f) => (
                    <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Size</span><span className="font-mono">{style.fontSize}</span></div>
                <Slider min={20} max={140} step={1} value={[style.fontSize]} onValueChange={([v]) => setStyle({ fontSize: v ?? 56 })} />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Vertical position</span><span className="font-mono">{Math.round(style.position * 100)}%</span></div>
                <Slider min={0.05} max={0.95} step={0.01} value={[style.position]} onValueChange={([v]) => setStyle({ position: v ?? 0.86 })} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-muted-foreground">Text</span>
                  <Input type="color" className="h-8 p-1" value={style.color} onChange={(e) => setStyle({ color: e.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">Outline</span>
                  <Input type="color" className="h-8 p-1" value={style.stroke} onChange={(e) => setStyle({ stroke: e.target.value })} />
                </label>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Outline width</span><span className="font-mono">{style.strokeWidth}</span></div>
                <Slider min={0} max={12} step={1} value={[style.strokeWidth]} onValueChange={([v]) => setStyle({ strokeWidth: v ?? 0 })} />
              </div>
              {(
                [
                  ["Background box", !!style.background, (on: boolean) => setStyle({ background: on ? "rgba(0,0,0,0.6)" : "" })],
                  ["Bold", style.bold, (on: boolean) => setStyle({ bold: on })],
                  ["Uppercase", style.uppercase, (on: boolean) => setStyle({ uppercase: on })],
                ] as [string, boolean, (b: boolean) => void][]
              ).map(([label, val, fn]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <Switch checked={val} onCheckedChange={fn} />
                </div>
              ))}
            </div>
          </details>

          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Cues</span>
              <Button size="sm" variant="ghost" className="h-7" onClick={addCue}>
                <Plus className="mr-1 h-3.5 w-3.5" /> At playhead
              </Button>
            </div>
            {active.cues.map((c) => {
              const on = c.id === currentCueId;
              return (
                <div key={c.id} className={cn("space-y-1 rounded-md border p-2", on && "border-primary")}>
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    <button className="text-primary" onClick={() => store.set({ time: c.start, playing: false })}>
                      {formatTime(c.start)}
                    </button>
                    <Input
                      type="number"
                      step={0.1}
                      className="h-6 w-16 px-1 text-[10px]"
                      value={c.start.toFixed(2)}
                      aria-label="Caption start"
                      onChange={(e) => setCue(c.id, { start: Math.max(0, Number(e.target.value)) })}
                    />
                    →
                    <Input
                      type="number"
                      step={0.1}
                      className="h-6 w-16 px-1 text-[10px]"
                      value={c.end.toFixed(2)}
                      aria-label="Caption end"
                      onChange={(e) => setCue(c.id, { end: Math.max(c.start + 0.1, Number(e.target.value)) })}
                    />
                    <button
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => updateTrack(active.id, (t) => ({ ...t, cues: t.cues.filter((x) => x.id !== c.id) }))}
                      aria-label="Delete cue"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <Button size="icon" variant="ghost" className="size-6" title="Convert to freely movable text" aria-label="Convert caption to text" onClick={() => convertCue(c)}><Type className="size-3" /></Button>
                  </div>
                  <Textarea aria-label="Caption text" rows={2} className="min-h-0 text-xs" value={c.text} onChange={(e) => setCue(c.id, { text: e.target.value })} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
