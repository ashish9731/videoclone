import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type EditorStore } from "@/lib/editor/store";
import { exportVideo } from "@/lib/editor/export";
import { type CaptionTrack, type MediaAsset, timelineDuration } from "@/lib/editor/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  store: EditorStore;
  assets: Map<string, MediaAsset>;
  captions: CaptionTrack[];
  project: { name: string; width: number; height: number; fps: number };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function ExportDialog({ open, onOpenChange, store, assets, captions, project }: Props) {
  const [res, setRes] = useState("1080");
  const [fps, setFps] = useState(String(project.fps));
  const [aspect, setAspect] = useState("original");
  const [autoReframe, setAutoReframe] = useState(false);
  const [burn, setBurn] = useState(true);
  const [job, setJob] = useState<{ p: number; label: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const short = Number(res);
  const k = short / Math.min(project.width, project.height);
  const ratio = aspect === "original" ? project.width/project.height : aspect === "16:9" ? 16/9 : aspect === "9:16" ? 9/16 : 1;
  const w = even(short * Math.max(1, ratio));
  const h = even(short * Math.max(1, 1/ratio));
  const visibleCaps = captions.filter((c) => c.visible && c.cues.length);

  const run = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setResult(null);
    setJob({ p: 0, label: "Starting" });
    const started = performance.now();
    try {
      const blob = await exportVideo({
        timeline: store.get().timeline,
        captions: burn ? visibleCaps : [],
        assets,
        width: w,
        height: h,
        baseHeight: project.height,
        sourceAspect: project.width/project.height,
        autoReframe,
        fps: Number(fps),
        signal: ac.signal,
        onProgress: (p, label) => setJob({ p, label }),
      });
      const url = URL.createObjectURL(blob);
      setResult(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name || "export"}.mp4`;
      a.click();
      toast.success(`Exported in ${Math.round((performance.now() - started) / 1000)}s (${(blob.size / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message || "Export failed");
    } finally {
      setJob(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !job && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export MP4</DialogTitle>
          <DialogDescription>
            Rendered on your computer — keep this tab open. Duration {timelineDuration(store.get().timeline).toFixed(1)}s.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Resolution</span>
            <Select value={res} onValueChange={setRes} disabled={!!job}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="480">480p</SelectItem>
                <SelectItem value="720">720p</SelectItem>
                <SelectItem value="1080">1080p</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Frame rate</span>
            <Select value={fps} onValueChange={setFps} disabled={!!job}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 fps</SelectItem>
                <SelectItem value="30">30 fps</SelectItem>
                <SelectItem value="60">60 fps</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          Output {w}×{h} · MP4
        </p>
        <div className="flex items-center justify-between rounded-md border p-3 text-sm">
          <div>
            <div>Burn in captions</div>
            <div className="text-xs text-muted-foreground">
              {visibleCaps.length ? visibleCaps.map((c) => c.name).join(", ") : "No visible caption tracks"}
            </div>
          </div>
          <Switch checked={burn} onCheckedChange={setBurn} disabled={!visibleCaps.length || !!job} />
        </div>
        {job && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{job.label}</span>
              <span className="font-mono">{Math.round(job.p * 100)}%</span>
            </div>
            <Progress value={job.p * 100} />
          </div>
        )}
        {result && !job && (
          <a href={result} download={`${project.name || "export"}.mp4`} className="text-sm text-primary underline">
            Download again
          </a>
        )}
        <label className="text-sm">Aspect ratio<select aria-label="Export aspect ratio" value={aspect} onChange={e => setAspect(e.target.value)} disabled={!!job} className="ml-3 bg-background">{["original","16:9","9:16","1:1"].map(a => <option key={a}>{a}</option>)}</select></label>
        <label className="flex items-center justify-between text-sm">Auto-reframe<Switch checked={autoReframe} onCheckedChange={setAutoReframe} disabled={!!job} /></label>
        <DialogFooter>
          {job ? (
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          ) : (
            <Button onClick={run}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
