import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, LogIn, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EditorMock } from "@/components/landing/EditorMock";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import {
  APP_PATH,
  AUTH_PATH,
  EXPORT_SPECS,
  FAQS,
  FEATURES,
  OG_DESCRIPTION,
  PRINCIPLES,
  PRO_COMING_SOON,
  SECTIONS,
  SITE_DESCRIPTION,
  SITE_TITLE,
  STATS,
  STEPS,
  TRANSITION_GROUPS,
} from "@/components/landing/site-data";
import { GENERATED_FILTERS } from "@/lib/editor/filter-gen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

// Real catalog entries, so the showcase cannot drift from what the editor can actually apply.
const SHOWCASE_FILTERS = GENERATED_FILTERS.filter((f, i) => i % 7 === 0).slice(0, 24);

function Landing() {
  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        {/* ---------------- hero ---------------- */}
        <section className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-70"
            style={{
              background:
                "radial-gradient(60% 50% at 15% 0%, oklch(0.72 0.19 45 / 0.14), transparent 70%), radial-gradient(55% 45% at 85% 10%, oklch(0.55 0.16 300 / 0.12), transparent 70%), linear-gradient(180deg, transparent 60%, oklch(0.12 0.005 260 / 0.9))",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(oklch(0.95 0.005 260) 1px, transparent 1px), linear-gradient(90deg, oklch(0.95 0.005 260) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />

          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 md:px-8 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Renders in your browser
              </span>

              <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold leading-[1.04] tracking-tight sm:text-5xl md:text-6xl lg:text-[4.1rem]">
                Cut, caption and ship video —{" "}
                <span className="text-primary">without leaving the tab.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Cutroom is a real multi-track timeline editor for the browser. Grade with 252
                filters, cut between clips with 64 transitions including camera moves, keyframe
                anything, lay a caption track over the cut and export an MP4 — encoded by your own
                machine, never a render farm.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg" className="gap-2 text-base">
                  <Link to={APP_PATH}>
                    Start editing
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="text-base">
                  <Link to={AUTH_PATH}>Sign in with Google or email</Link>
                </Button>
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {[
                  "No credit card",
                  "No watermark",
                  "No upload queue",
                  "Projects save to your account",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <EditorMock />
          </div>
        </section>

        {/* ---------------- stats ---------------- */}
        <section className="border-y bg-panel/30">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-5 py-10 md:grid-cols-4 md:px-8">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <dt className="font-display text-3xl font-bold md:text-4xl">{s.value}</dt>
                <dd className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---------------- features ---------------- */}
        <section
          id={SECTIONS.features}
          className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
        >
          <SectionHead
            kicker="01 — the toolkit"
            title="Everything a cut needs, on one timeline"
            body="Tracks hold video, images, audio, text and full-frame effect blocks. Anything can go anywhere on the lane — the timeline is not a form with fixed slots."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-card/60"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/12 ring-1 ring-primary/25">
                  <f.icon className="h-4 w-4 text-primary" />
                </span>
                <h3 className="mt-4 font-semibold leading-snug">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------- record ---------------- */}
        <section id={SECTIONS.record} className="scroll-mt-24 border-y bg-panel/20 py-20 md:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-8 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <Mic className="h-3.5 w-3.5 text-primary" />
                New in the editor
              </p>
              <h2 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-4xl">
                Record the take without leaving the tab
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Speak a voice-over into your microphone, or capture the audio the tab is already
                playing — and it lands on the timeline as its own clip. No external recorder, no
                file to import, no trip through a server before you can cut it.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link to={APP_PATH}>
                    Try recording <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to={AUTH_PATH}>Sign in to start</Link>
                </Button>
              </div>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  t: "Mic or browser audio",
                  b: "Pick an external input, or grab the tab's own sound — a beat, a reference, a screen mix.",
                },
                {
                  t: "Frame-exact and lossless",
                  b: "The take is normalized to a WAV clip, so its length is precise and the first word is never clipped.",
                },
                {
                  t: "Straight onto the lane",
                  b: "It drops where the playhead sits, ready to trim, fade, duck under dialogue and move like any other clip.",
                },
                {
                  t: "Reusable in the project",
                  b: "Saved to your private storage and listed in the library, so the same voice-over fits anywhere later.",
                },
              ].map((c) => (
                <li key={c.t} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/12 ring-1 ring-primary/25">
                      <Check className="h-4 w-4 text-primary" />
                    </span>
                    <h3 className="font-semibold leading-snug">{c.t}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- library ---------------- */}
        <section id={SECTIONS.library} className="scroll-mt-24 border-y bg-panel/20 py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <SectionHead
              kicker="02 — the library"
              title="Looks generated, not borrowed"
              body="Every grade below is a real entry in the editor's filter catalog, drawn from the same colour-matrix and curve data the exporter applies."
            />
          </div>

          <div className="relative mt-10 overflow-hidden">
            <div className="cutroom-marquee flex w-max gap-3 px-5 md:px-8">
              {[...SHOWCASE_FILTERS, ...SHOWCASE_FILTERS].map((f, i) => (
                <figure
                  key={`${f.id}-${i}`}
                  className="w-40 shrink-0 overflow-hidden rounded-lg border bg-card"
                >
                  <span
                    aria-hidden="true"
                    className="block h-20 w-full"
                    style={{ background: f.swatch }}
                  />
                  <figcaption className="truncate px-3 py-2 text-xs font-medium text-muted-foreground">
                    {f.name}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-transparent to-background"
            />
          </div>

          <div className="mx-auto mt-10 max-w-7xl px-5 md:px-8">
            <div className="flex flex-wrap gap-2">
              {TRANSITION_GROUPS.map((g) => (
                <span
                  key={g}
                  className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground"
                >
                  {g} transitions
                </span>
              ))}
              <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                hover to pause the reel
              </span>
            </div>
          </div>
        </section>

        {/* ---------------- principles ---------------- */}
        <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
          <div className="grid gap-4 md:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                className="rounded-xl border bg-gradient-to-b from-card to-transparent p-6"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-base font-semibold">{p.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- workflow ---------------- */}
        <section
          id={SECTIONS.workflow}
          className="scroll-mt-24 border-y bg-panel/20 py-20 md:py-28"
        >
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <SectionHead
              kicker="03 — the workflow"
              title="Four moves from raw clip to finished file"
              body="Sign in once, then the same path every time. Nothing is uploaded to be processed and nothing is emailed to you later."
            />

            <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="bg-card p-6">
                  <span className="font-mono text-xs tracking-widest text-primary">{s.n}</span>
                  <h3 className="mt-3 font-semibold leading-snug">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-center">
              <Button asChild size="lg" variant="secondary" className="gap-2">
                <Link to={APP_PATH}>
                  Open my projects <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Already editing? Your timeline is stored with your account.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- captions + export ---------------- */}
        <section
          id={SECTIONS.export}
          className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
        >
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
                04 — captions
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
                A caption track you can actually edit
              </h2>
              <p className="mt-4 text-muted-foreground">
                Import an .srt or .vtt and every cue becomes a block on its own lane: drag the body
                to move the phrase, drag an end to retime it, restyle the whole track. No subtitle
                file? Add a cue at the playhead and type it. Visible tracks burn into the export.
              </p>

              <div className="mt-6 rounded-xl border bg-card p-4">
                <p className="rounded bg-black/60 px-3 py-2 text-center text-sm font-semibold leading-snug">
                  “The renderer you preview with is the renderer you export with.”
                </p>
                <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  burned-in caption · track 2
                </p>
              </div>

              <h3 className="mt-8 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Coming soon in the Pro version
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {PRO_COMING_SOON.map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
                05 — export
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
                MP4, encoded where you edit
              </h2>
              <p className="mt-4 text-muted-foreground">
                WebCodecs frames go straight into an MP4 muxer in the same tab. It asks for H.264
                and AAC first; if the browser will not encode them, it falls back to VP9 or AV1 with
                Opus instead of failing.
              </p>

              <dl className="mt-8 divide-y rounded-xl border bg-card">
                {EXPORT_SPECS.map((row) => (
                  <div key={row.k} className="flex items-baseline gap-4 px-5 py-3.5">
                    <dt className="w-28 shrink-0 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {row.k}
                    </dt>
                    <dd className="text-sm">{row.v}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                Frame rate, resolution and caption styling are taken from the project you are
                looking at, so the file matches the preview.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- faq ---------------- */}
        <section id={SECTIONS.faq} className="scroll-mt-24 border-t bg-panel/20 py-20 md:py-24">
          <div className="mx-auto max-w-3xl px-5 md:px-8">
            <SectionHead kicker="06 — questions" title="Straight answers" align="left" />
            <Accordion type="single" collapsible className="mt-8">
              {FAQS.map((f, i) => (
                <AccordionItem key={f.q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-[15px] hover:no-underline">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ---------------- final cta ---------------- */}
        <section className="px-5 py-20 md:px-8 md:py-28">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border bg-card px-6 py-14 text-center md:px-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(70% 120% at 50% 0%, oklch(0.72 0.19 45 / 0.22), transparent 70%), linear-gradient(180deg, transparent, oklch(0.12 0.005 260 / 0.7))",
              }}
            />
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
              00:00:00:00 — rec
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Your next cut can happen in this tab
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Create an account, drop footage on the timeline and export. No installs, no seats to
              provision, no render queue to wait for.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="gap-2 text-base">
                <Link to={APP_PATH}>
                  Start editing now <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="gap-2 text-base">
                <Link to={AUTH_PATH}>
                  <LogIn className="h-4 w-4" /> Sign in
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function SectionHead({
  kicker,
  title,
  body,
  align = "center",
}: {
  kicker: string;
  title: string;
  body?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">{kicker}</p>
      <h2 className="mt-4 font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      {body && <p className="mt-4 leading-relaxed text-muted-foreground">{body}</p>}
    </div>
  );
}
