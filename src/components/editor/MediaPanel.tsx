import { useRef, useState } from "react";
import { Film, Image as ImageIcon, Music, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type EditorStore } from "@/lib/editor/store";
import { deleteMedia, uploadMedia } from "@/lib/editor/media";
import { type MediaAsset, clipFromAsset, formatTime } from "@/lib/editor/types";
import { addClipToTimeline } from "@/lib/editor/placement";
import { writeAssetDrag, endAssetDrag } from "./library-drag";

interface Props {
  store: EditorStore;
  assets: MediaAsset[];
  onAdded: (a: MediaAsset) => void;
  onRemoved: (id: string) => void;
  userId: string;
  projectId: string;
}

const icon = { video: Film, audio: Music, image: ImageIcon };

export function MediaPanel({ store, assets, onAdded, onRemoved, userId, projectId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ id: string; name: string; p: number }[]>([]);
  const [over, setOver] = useState(false);

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      setUploads((u) => [...u, { id, name: file.name, p: 0 }]);
      try {
        const a = await uploadMedia(file, userId, projectId, (p) =>
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, p } : x))),
        );
        onAdded(a);
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setUploads((u) => u.filter((x) => x.id !== id));
      }
    }
  };

  const remove = async (a: MediaAsset) => {
    const used = store.get().timeline.tracks.some((t) => t.clips.some((c) => c.assetId === a.id));
    if (used && !confirm("This media is used on the timeline. Delete it and remove its clips?")) return;
    try {
      await deleteMedia(a);
      if (used)
        store.update((t) => ({ tracks: t.tracks.map((tr) => ({ ...tr, clips: tr.clips.filter((c) => c.assetId !== a.id) })) }));
      onRemoved(a.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className="p-3">
        <button
          onClick={() => inputRef.current?.click()}
          className={`flex w-full flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-sm transition-colors ${over ? "border-primary bg-primary/10" : "hover:bg-accent"}`}
        >
          <Upload className="h-5 w-5 text-primary" />
          <span>Upload or drop files</span>
          <span className="text-xs text-muted-foreground">Video, audio, images · up to 1 GB</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {uploads.map((u) => (
          <div key={u.id} className="rounded-md bg-secondary p-2 text-xs">
            <div className="truncate">{u.name}</div>
            <Progress value={u.p * 100} className="mt-1 h-1" />
          </div>
        ))}
        {assets.length === 0 && uploads.length === 0 && (
          <p className="pt-6 text-center text-xs text-muted-foreground">No media yet.</p>
        )}
        {assets.map((a) => {
          const I = icon[a.kind];
          return (
            <div
              key={a.id}
              draggable
              onDragStart={(e) => writeAssetDrag(e, a.id)}
              onDragEnd={endAssetDrag}
              className="group flex cursor-grab items-center gap-2 rounded-md p-2 hover:bg-accent"
            >
              <I className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{a.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {a.kind === "image" ? `${a.width}×${a.height}` : formatTime(a.duration)}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => addClipToTimeline(store, clipFromAsset(a, store.get().time))}
                aria-label="Add to timeline at playhead"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => remove(a)} aria-label="Delete media">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
