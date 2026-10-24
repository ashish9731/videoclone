import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { type EditorStore, useEditor } from "@/lib/editor/store";
import { signedUrl, uploadMedia } from "@/lib/editor/media";
import { type MediaAsset, type Watermark, type WatermarkPosition } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

const POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "center", label: "Center" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

/** One labelled slider over a 0–1 value shown as a percentage. */
function PercentRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1.5 text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => v !== undefined && onChange(v)}
      />
    </label>
  );
}

export function WatermarkPanel({
  store,
  assets,
  userId,
  projectId,
  onAdded,
}: {
  store: EditorStore;
  assets: Map<string, MediaAsset>;
  userId: string;
  projectId: string;
  onAdded: (a: MediaAsset) => void;
}) {
  const wm = useEditor(store, (s) => s.watermark);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const set = (patch: Partial<Watermark>) =>
    store.setWatermark({ ...store.get().watermark, ...patch });

  // resolve the selected logo to a signed URL for the thumbnail
  useEffect(() => {
    let active = true;
    const id = wm.kind === "logo" ? wm.logoAssetId : undefined;
    const asset = id ? assets.get(id) : undefined;
    if (!asset) {
      setLogoUrl(null);
      return () => {
        active = false;
      };
    }
    signedUrl(asset.storage_path)
      .then((u) => {
        if (active) setLogoUrl(u);
      })
      .catch(() => {
        if (active) setLogoUrl(null);
      });
    return () => {
      active = false;
    };
  }, [wm.kind, wm.logoAssetId, assets]);

  const putLogo = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (PNG with transparency works best)");
      return;
    }
    setBusy(true);
    try {
      const asset = await uploadMedia(file, userId, projectId, () => {});
      onAdded(asset);
      set({ kind: "logo", logoAssetId: asset.id, enabled: true });
      toast.success("Logo added as watermark");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the logo");
    } finally {
      setBusy(false);
    }
  };

  const existingLogos = [...assets.values()].filter((a) => a.kind === "image");

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        <span>Add watermark</span>
        <Switch
          checked={wm.enabled}
          onCheckedChange={(v) => set({ enabled: v })}
          aria-label="Add watermark"
        />
      </label>

      {!wm.enabled && (
        <p className="text-xs text-muted-foreground">
          Turn on to stamp a translucent mark over the whole video. It is baked into the preview and
          the export so it travels with the file.
        </p>
      )}

      <div className={cn("space-y-5", !wm.enabled && "pointer-events-none opacity-50")}>
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Type</span>
          <div className="grid grid-cols-2 gap-2">
            {(["text", "logo"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={wm.kind === k ? "default" : "outline"}
                className="capitalize"
                onClick={() => set({ kind: k })}
                disabled={k === "logo" && !wm.logoAssetId && existingLogos.length === 0 && !logoUrl}
              >
                {k}
              </Button>
            ))}
          </div>
        </div>

        {wm.kind === "text" ? (
          <div className="space-y-3">
            <label className="block space-y-1.5 text-xs">
              <span>Watermark text</span>
              <Input
                value={wm.text}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="Your name or brand"
              />
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <span>Color</span>
                <input
                  type="color"
                  aria-label="Watermark color"
                  value={wm.color}
                  onChange={(e) => set({ color: e.target.value })}
                  className="size-8 cursor-pointer rounded border bg-transparent p-0.5"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={wm.bold}
                  onCheckedChange={(v) => set({ bold: v })}
                  aria-label="Bold"
                />{" "}
                Bold
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void putLogo(f);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Watermark logo"
                  className="h-12 w-12 rounded border bg-stage object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed text-muted-foreground">
                  <ImagePlus className="size-5" />
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1 size-4" />
                )}
                {wm.logoAssetId ? "Change logo" : "Upload logo"}
              </Button>
              {wm.logoAssetId && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove logo"
                  title="Remove logo"
                  onClick={() => set({ logoAssetId: undefined })}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            {existingLogos.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Or pick a project image</span>
                <div className="flex flex-wrap gap-2">
                  {existingLogos.map((a) => (
                    <LogoThumb
                      key={a.id}
                      asset={a}
                      selected={a.id === wm.logoAssetId}
                      onPick={() => set({ kind: "logo", logoAssetId: a.id, enabled: true })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <PercentRow
          label="Size"
          value={wm.size}
          min={0.02}
          max={0.25}
          step={0.005}
          onChange={(v) => set({ size: v })}
        />
        <PercentRow
          label="Opacity"
          value={wm.opacity}
          min={0.05}
          max={1}
          step={0.05}
          onChange={(v) => set({ opacity: v })}
        />

        <label className="block space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span>Rotation</span>
            <span className="font-mono text-muted-foreground">{Math.round(wm.rotation)}°</span>
          </div>
          <Slider
            aria-label="Rotation"
            min={-90}
            max={90}
            step={1}
            value={[wm.rotation]}
            onValueChange={([v]) => v !== undefined && set({ rotation: v })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Repeat across frame</span>
          <Switch
            checked={wm.tiled}
            onCheckedChange={(v) => set({ tiled: v })}
            aria-label="Repeat across frame"
          />
        </label>

        {wm.tiled ? (
          <PercentRow
            label="Edge margin"
            value={wm.padding}
            min={0}
            max={0.2}
            step={0.01}
            onChange={(v) => set({ padding: v })}
          />
        ) : (
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Position</span>
            <div className="grid grid-cols-2 gap-2">
              {POSITIONS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={wm.position === p.id ? "default" : "outline"}
                  onClick={() => set({ position: p.id })}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LogoThumb({
  asset,
  selected,
  onPick,
}: {
  asset: MediaAsset;
  selected: boolean;
  onPick: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    signedUrl(asset.storage_path)
      .then((u) => {
        if (active) setUrl(u);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [asset.storage_path]);
  if (!url) return <div className="size-12 animate-pulse rounded border bg-muted" />;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Use ${asset.name}`}
      title={asset.name}
      className={cn(
        "size-12 overflow-hidden rounded border bg-stage p-1",
        selected && "ring-2 ring-primary",
      )}
    >
      <img src={url} alt={asset.name} className="size-full object-contain" />
    </button>
  );
}
