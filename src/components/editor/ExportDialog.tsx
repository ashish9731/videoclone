import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Clapperboard, Download, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** A finished single-file render the user can watch before deciding to keep it. */
interface Take {
  url: string;
  blob: Blob;
  seconds: number;
  size: number;
}

/**
 * Two stages on purpose: "Combine" first merges every lane - video, audio, text, images, effects,
 * transitions, filters, the watermark - into one MP4 and plays it back here, so what the user is
 * about to save is exactly what they see. Only after that does "Export" hand the file over. The
 * render runs once; Export reuses the finished blob instead of encoding a second time.
 */
export function ExportDialog({ open, onOpenChange, store, assets, captions, project }: Props) {
  const [stage, setStage] = useState<"setup" | "review">("setup");
  const [res, setRes] = useState("1080");
  const [fps, setFps] = useState(String(project.fps));
  const [aspect, setAspect] = useState("original");
  const [autoReframe, setAutoReframe] = useState(false);
  const [burn, setBurn] = useState(true);
  const [job, setJob] = useState<{ p: number; label: string } | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // the last preview URL, so leaving the dialog (or re-combining) never strands an object URL
  const urlRef = useRef<string | null>(null);

  const short = Number(res);
  const ratio =
    aspect === "original"
      ? project.width / project.height
      : aspect === "16:9"
        ? 16 / 9
        : aspect === "9:16"
          ? 9 / 16
          : 1;
  const w = even(short * Math.max(1, ratio));
  const h = even(short * Math.max(1, 1 / ratio));
  const visibleCaps = captions.filter((c) => c.visible && c.cues.length);

  const clearTake = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setTake(null);
  };

  const combine = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    clearTake();
    setJob({ p: 0, label: "Combining" });
    const started = performance.now();
    try {
      const blob = await exportVideo({
        timeline: store.get().timeline,
        captions: burn ? visibleCaps : [],
        assets,
        width: w,
        height: h,
        baseHeight: project.height,
        sourceAspect: project.width / project.height,
        autoReframe,
        watermark: store.get().watermark,
        fps: Number(fps),
        signal: ac.signal,
        onProgress: (p, label) => setJob({ p, label }),
      });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setTake({
        url,
        blob,
        seconds: timelineDuration(store.get().timeline),
        size: blob.size,
      });
      setStage("review");
      toast.success(
        `Combined into one video in ${Math.round((performance.now() - started) / 1000)}s`,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message || "Combine failed");
    } finally {
      setJob(null);
    }
  };

  const download = () => {
    if (!take) return;
    const a = document.createElement("a");
    a.href = take.url;
    a.download = `${project.name || "export"}.mp4`;
    a.click();
    toast.success(`Saved ${(take.size / 1e6).toFixed(1)} MB MP4`);
  };

  const backToSetup = () => {
    clearTake();
    setStage("setup");
  };

  // the dialog only closes through onOpenChange; drop the preview URL the moment it goes away
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (job) return;
        if (!o) clearTake();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stage === "setup" ? (
              <>
                <Clapperboard className="h-4 w-4 text-primary" /> Combine into one video
              </>
            ) : (
              <>
                <Film className="h-4 w-4 text-primary" /> Combined preview
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {stage === "setup" ? (
              <>
                Every lane - video, audio, text, images, effects, transitions, filters and the
                watermark - is merged into a single MP4, rendered on your computer. Duration{" "}
                {timelineDuration(store.get().timeline).toFixed(1)}s.
              </>
            ) : (
              <>
                Watch the combined result below. When it looks right, export saves this exact file -
                no second render.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {stage === "setup" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Resolution</span>
                <Select value={res} onValueChange={setRes} disabled={!!job}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  {visibleCaps.length
                    ? visibleCaps.map((c) => c.name).join(", ")
                    : "No visible caption tracks"}
                </div>
              </div>
              <Switch
                checked={burn}
                onCheckedChange={setBurn}
                disabled={!visibleCaps.length || !!job}
              />
            </div>
            <label className="text-sm">
              Aspect ratio
              <select
                aria-label="Export aspect ratio"
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                disabled={!!job}
                className="ml-3 bg-background"
              >
                {["original", "16:9", "9:16", "1:1"].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between text-sm">
              Auto-reframe
              <Switch checked={autoReframe} onCheckedChange={setAutoReframe} disabled={!!job} />
            </label>
            {job && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{job.label}</span>
                  <span className="font-mono">{Math.round(job.p * 100)}%</span>
                </div>
                <Progress value={job.p * 100} />
              </div>
            )}
            <DialogFooter>
              {job ? (
                <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              ) : (
                <Button onClick={combine}>
                  <Clapperboard className="mr-2 h-4 w-4" /> Combine
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          take && (
            <>
              <video
                src={take.url}
                controls
                autoPlay
                playsInline
                className="max-h-[52vh] w-full rounded-lg border bg-black"
              />
              <p className="font-mono text-xs text-muted-foreground">
                {take.seconds.toFixed(1)}s · {w}×{h} · MP4 · {(take.size / 1e6).toFixed(1)} MB
              </p>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="ghost" onClick={backToSetup} disabled={!!job}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Change settings
                </Button>
                <Button onClick={download}>
                  <Download className="mr-2 h-4 w-4" /> Export MP4
                </Button>
              </DialogFooter>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
