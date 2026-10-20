import { createFileRoute, Link } from "@tanstack/react-router";
import { Captions, Film, Layers, Scissors, Sparkles, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cutroom — Multi-track video editor with AI captions" },
      {
        name: "description",
        content: "Edit video in your browser: multi-track timeline, keyframes, transitions, AI captions with translation, and MP4 export.",
      },
      { property: "og:title", content: "Cutroom — Multi-track video editor with AI captions" },
      {
        property: "og:description",
        content: "A real timeline editor in the browser with AI subtitles, translation and MP4 export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Layers, title: "Multi-track timeline", body: "Stack video, images, audio and text. Drag, trim, split, snap." },
  { icon: Sparkles, title: "Effects & keyframes", body: "Color grade, blur, transitions, and animate position, scale, rotation, opacity." },
  { icon: Captions, title: "AI captions", body: "Transcribe speech into timed subtitles, edit and style them, translate to 20 languages." },
  { icon: Download, title: "MP4 export", body: "Render up to 1080p H.264 right in your browser, with captions burned in." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <Scissors className="h-5 w-5 text-primary" /> Cutroom
        </div>
        <Button asChild variant="secondary">
          <Link to="/projects">Open my projects</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">00:00:00:00 — rec</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Cut, caption and ship video — in the browser.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          A real multi-track editor with keyframes, transitions and AI subtitles. Your projects and media are saved
          to your account.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg">
            <Link to="/projects">
              <Film className="mr-2 h-4 w-4" /> Start editing
            </Link>
          </Button>
        </div>
        <div className="mt-20 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="bg-card p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
