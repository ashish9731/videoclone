import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, LogOut, Plus, Scissors, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { defaultTimeline } from "@/lib/editor/types";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "My projects — Cutroom" },
      { name: "description", content: "Your saved Cutroom video projects." },
      { property: "og:title", content: "My projects — Cutroom" },
      { property: "og:description", content: "Your saved Cutroom video projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Projects,
});

const FORMATS = [
  { label: "Landscape 16:9", w: 1920, h: 1080 },
  { label: "Vertical 9:16", w: 1080, h: 1920 },
  { label: "Square 1:1", w: 1080, h: 1080 },
  { label: "Portrait 4:5", w: 1080, h: 1350 },
];

function Projects() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Untitled project");
  const [fmt, setFmt] = useState(0);

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,width,height,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const f = FORMATS[fmt] ?? FORMATS[0]!;
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: name.trim() || "Untitled project",
          width: f.w,
          height: f.h,
          timeline: defaultTimeline() as unknown as Json,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => navigate({ to: "/editor/$projectId", params: { projectId: id } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: media } = await supabase.from("media_assets").select("storage_path").eq("project_id", id);
      if (media?.length) await supabase.storage.from("media").remove(media.map((m) => m.storage_path));
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link to="/" className="flex items-center gap-2 font-display font-bold">
          <Scissors className="h-5 w-5 text-primary" /> Cutroom
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email || "Signed in"}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Projects</h1>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New project
          </Button>
        </div>
        {isLoading ? (
          <p className="mt-10 text-muted-foreground">Loading…</p>
        ) : !projects?.length ? (
          <div className="mt-10 rounded-xl border border-dashed p-16 text-center">
            <Film className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No projects yet. Create one to start editing.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/60">
                <Link to="/editor/$projectId" params={{ projectId: p.id }} className="block">
                  <div className="flex aspect-video items-center justify-center rounded-md bg-stage">
                    <div
                      className="border border-primary/40 bg-secondary"
                      style={{ aspectRatio: `${p.width}/${p.height}`, height: p.height >= p.width ? "80%" : undefined, width: p.width > p.height ? "70%" : undefined }}
                    />
                  </div>
                  <h3 className="mt-3 truncate font-semibold">{p.name}</h3>
                  <p className="font-mono text-xs text-muted-foreground">
                    {p.width}×{p.height} · {new Date(p.updated_at).toLocaleString()}
                  </p>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground hover:text-destructive"
                  onClick={() => confirm(`Delete "${p.name}" and its media?`) && remove.mutate(p.id)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f, i) => (
              <button
                key={f.label}
                onClick={() => setFmt(i)}
                className={`rounded-md border p-3 text-left text-sm ${fmt === i ? "border-primary bg-primary/10" : "hover:bg-accent"}`}
              >
                <div className="font-medium">{f.label}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {f.w}×{f.h}
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create & open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
