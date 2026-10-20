import { AudioLibrary } from "@/components/editor/AudioLibrary";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Captions, Download, FolderOpen, Smile, Type, Music, Sparkles, Blend, SlidersHorizontal, Palette, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorStore, useEditor } from "@/lib/editor/store";
import {
  type CaptionTrack,
  type MediaAsset,
  type Timeline as TL,
  defaultCaptionStyle,
  defaultTimeline,
} from "@/lib/editor/types";
import { Preview } from "@/components/editor/Preview";
import { Timeline } from "@/components/editor/Timeline";
import { MediaPanel } from "@/components/editor/MediaPanel";
import { Inspector } from "@/components/editor/Inspector";
import { CaptionsPanel } from "@/components/editor/CaptionsPanel";
import { ExportDialog } from "@/components/editor/ExportDialog";
import { AssetBrowser, type LibraryTab } from "@/components/editor/AssetBrowser";

interface ProjectRow {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  timeline: TL;
}

async function loadEditor(projectId: string) {
  const [p, m, c] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("media_assets").select("*").eq("project_id", projectId).order("created_at"),
    supabase.from("caption_tracks").select("*").eq("project_id", projectId).order("created_at"),
  ]);
  if (p.error) throw new Error(p.error.message);
  const timeline = (p.data.timeline as unknown as TL)?.tracks ? (p.data.timeline as unknown as TL) : defaultTimeline();
  return {
    project: { ...p.data, timeline } as ProjectRow,
    assets: (m.data ?? []) as MediaAsset[],
    captions: (c.data ?? []).map((r) => ({
      ...r,
      cues: r.cues as unknown as CaptionTrack["cues"],
      style: { ...defaultCaptionStyle(), ...(r.style as object) },
    })) as CaptionTrack[],
  };
}

export const Route = createFileRoute("/_authenticated/editor/$projectId")({
  head: () => ({
    meta: [
      { title: "Editor — Cutroom" },
      { name: "description", content: "Edit your video project on the Cutroom timeline." },
      { property: "og:title", content: "Editor — Cutroom" },
      { property: "og:description", content: "Edit your video project on the Cutroom timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ params }) => loadEditor(params.projectId),
  pendingComponent: () => <div className="flex h-screen items-center justify-center text-muted-foreground">Loading project…</div>,
  component: EditorPage,
});

function EditorPage() {
  const data = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const [store] = useState(() => new EditorStore(data.project.timeline));
  // dev-only handle for automated checks of preview rendering
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __cutroom?: EditorStore }).__cutroom = store;
  }, [store]);
  const [name, setName] = useState(data.project.name);
  const [assetList, setAssetList] = useState<MediaAsset[]>(data.assets);
  const assets = useMemo(() => new Map(assetList.map((a) => [a.id, a])), [assetList]);
  const [captions, setCaptions] = useState<CaptionTrack[]>(data.captions);
  const [activeCap, setActiveCap] = useState<string | null>(data.captions[0]?.id ?? null);
  const [exportOpen, setExportOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('Media');
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const version = useEditor(store, (s) => s.version);
  const projectId = data.project.id;

  // autosave timeline
  useEffect(() => {
    if (version === 0) return undefined;
    setSaveState("saving");
    const h = setTimeout(async () => {
      const { error } = await supabase
        .from("projects")
        .update({ timeline: store.get().timeline as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      setSaveState(error ? "error" : "saved");
      if (error) toast.error(`Couldn't save: ${error.message}`);
    }, 800);
    return () => clearTimeout(h);
  }, [version, store, projectId]);

  // save name
  useEffect(() => {
    if (name === data.project.name) return undefined;
    const h = setTimeout(() => void supabase.from("projects").update({ name }).eq("id", projectId), 600);
    return () => clearTimeout(h);
  }, [name, data.project.name, projectId]);

  // caption persistence (debounced per track)
  const capTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const updateCaption = useCallback((id: string, fn: (t: CaptionTrack) => CaptionTrack) => {
    setCaptions((list) => {
      const next = list.map((t) => (t.id === id ? fn(t) : t));
      const t = next.find((x) => x.id === id);
      if (t) {
        clearTimeout(capTimers.current.get(id));
        capTimers.current.set(
          id,
          setTimeout(async () => {
            const { error } = await supabase
              .from("caption_tracks")
              .update({
                name: t.name,
                language: t.language,
                cues: t.cues as unknown as Json,
                style: t.style as unknown as Json,
                visible: t.visible,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
            if (error) toast.error(`Couldn't save captions: ${error.message}`);
          }, 600),
        );
      }
      return next;
    });
  }, []);

  const createCaption = useCallback(
    async (t: Omit<CaptionTrack, "id" | "project_id">) => {
      const { data: row, error } = await supabase
        .from("caption_tracks")
        .insert({
          user_id: user.id,
          project_id: projectId,
          name: t.name,
          language: t.language,
          cues: t.cues as unknown as Json,
          style: t.style as unknown as Json,
          visible: t.visible,
        })
        .select()
        .single();
      if (error || !row) {
        toast.error(error?.message ?? "Couldn't create caption track");
        return null;
      }
      const track: CaptionTrack = { ...t, id: row.id, project_id: projectId };
      setCaptions((l) => [...l, track]);
      return track;
    },
    [projectId, user.id],
  );

  const deleteCaption = useCallback(async (id: string) => {
    const { error } = await supabase.from("caption_tracks").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCaptions((l) => l.filter((t) => t.id !== id));
    setActiveCap((a) => (a === id ? null : a));
  }, []);

  const p = data.project;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-panel px-3">
        <Button asChild size="icon" variant="ghost" aria-label="Back to projects">
          <Link to="/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-64 border-transparent bg-transparent font-display font-semibold hover:border-input" />
        <span className="font-mono text-[11px] text-muted-foreground">
          {p.width}×{p.height} · {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
        </span>
        <Button className="ml-auto" size="sm" onClick={() => setExportOpen(true)}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </header>

      <div role="tablist" aria-label="Editor libraries" className="flex shrink-0 gap-1 overflow-x-auto border-b bg-panel px-3 py-1">
        {([{ name: 'Media', icon: FolderOpen }, { name: 'Audio', icon: Music }, { name: 'Text', icon: Type }, { name: 'Stickers', icon: Smile }, { name: 'Effects', icon: Sparkles }, { name: 'Transitions', icon: Blend }, { name: 'Captions', icon: Captions }, { name: 'Filters', icon: Palette }, { name: 'Adjustment', icon: SlidersHorizontal }, { name: 'AI avatar', icon: UserRound }] as const).map(t => <Button key={t.name} role="tab" aria-selected={libraryTab === t.name} variant="ghost" className={`h-14 min-w-16 shrink-0 flex-col gap-1 rounded-none px-3 text-[11px] ${libraryTab === t.name ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`} onClick={() => setLibraryTab(t.name)}><t.icon className="size-4" />{t.name}</Button>)}
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[420px] shrink-0 flex-col border-r bg-panel 2xl:w-[500px]">
          <AssetBrowser key={libraryTab} tab={libraryTab} store={store} width={p.width} height={p.height}
            media={<MediaPanel store={store} assets={assetList} userId={user.id} projectId={projectId} onAdded={a => setAssetList(l => [...l, a])} onRemoved={id => setAssetList(l => l.filter(x => x.id !== id))} />}
            audio={<AudioLibrary store={store} userId={user.id} projectId={projectId} onAdded={a => setAssetList(l => [...l, a])} />}
            captions={<CaptionsPanel store={store} assets={assets} tracks={captions} activeId={activeCap} setActiveId={setActiveCap} createTrack={createCaption} updateTrack={updateCaption} deleteTrack={deleteCaption} />}
          />
        </aside>

        <main className="min-w-0 flex-1">
          <Preview store={store} assets={assets} captions={captions} width={p.width} height={p.height} fps={p.fps} />
        </main>

        <aside className="w-64 shrink-0 border-l bg-panel 2xl:w-80">
          <Inspector store={store} width={p.width} />
        </aside>
      </div>

      <div className="h-[300px] shrink-0 border-t">
        <Timeline store={store} assets={assets} />
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        store={store}
        assets={assets}
        captions={captions}
        project={{ name, width: p.width, height: p.height, fps: p.fps }}
      />
    </div>
  );
}
