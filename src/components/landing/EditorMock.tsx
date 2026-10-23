import { Captions, Layers, Scissors, Sparkles, Type } from "lucide-react";
import { MOCK_PRESETS } from "./site-data";

/**
 * A still of the editor drawn with divs and CSS. It uses the app's own palette tokens (stage, panel,
 * clip-*) so the marketing page shows the real interface language instead of a stock illustration,
 * without shipping the render engine or a video file to a public route.
 */

// Deterministic pseudo-waveform: the same shape on every render, server and client.
const WAVE = Array.from(
  { length: 74 },
  (_, i) => 22 + Math.round(Math.abs(Math.sin(i * 12.9898)) * 62),
);

const LANE_LABELS = ["V2", "V1", "FX", "A1"] as const;

export function EditorMock() {
  return (
    <div className="relative">
      {/* glow behind the window */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-2xl"
      />

      <div className="overflow-hidden rounded-xl border bg-panel shadow-2xl shadow-black/40">
        {/* window chrome */}
        <div className="flex items-center gap-3 border-b px-3 py-2">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          </span>
          <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            cutroom · sunset-cut.edit
          </span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary">
            <span className="cutroom-pulse h-1.5 w-1.5 rounded-full bg-primary" />
            rec
          </span>
        </div>

        {/* stage */}
        <div className="relative aspect-video bg-stage">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 70% 15%, oklch(0.72 0.19 45 / 0.55), transparent 60%), radial-gradient(90% 70% at 20% 90%, oklch(0.55 0.16 300 / 0.35), transparent 65%), linear-gradient(180deg, oklch(0.28 0.03 260), oklch(0.12 0.005 260))",
            }}
          />
          {/* horizon + light streak, so the frame reads as footage rather than a gradient blob */}
          <div aria-hidden="true" className="absolute inset-x-0 top-[58%] h-px bg-foreground/20" />
          <div
            aria-hidden="true"
            className="cutroom-sheen absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent"
          />

          <div className="absolute left-3 top-3 flex gap-1.5">
            <Chip icon={Sparkles} label={MOCK_PRESETS.filter} tone="effect" />
            <Chip icon={Layers} label={MOCK_PRESETS.transition} tone="transition" />
          </div>
          <div className="absolute right-3 top-3 font-mono text-[11px] tabular-nums text-foreground/70">
            00:00:12:07
          </div>

          <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
            <p className="rounded bg-black/55 px-2.5 py-1 text-center text-[13px] font-semibold leading-tight text-white sm:text-base">
              Cut, caption and ship — in the browser.
            </p>
          </div>
        </div>

        {/* toolbar */}
        <div className="flex items-center gap-1 border-t px-3 py-2 text-muted-foreground">
          {[Scissors, Type, Captions, Sparkles].map((Icon, i) => (
            <span
              key={i}
              className="grid h-6 w-6 place-items-center rounded-md bg-card ring-1 ring-border"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          ))}
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest">
            30 fps · 1080p
          </span>
        </div>

        {/* timeline */}
        <div className="relative border-t bg-background/60 px-3 pb-3 pt-2">
          <div
            aria-hidden="true"
            className="mb-2 h-3 rounded-sm"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, oklch(0.66 0.012 260 / 0.5) 0 1px, transparent 1px 56px)",
            }}
          />

          {/* playhead: a full-width wrapper slides so the 2px line lands anywhere on the lanes */}
          <div
            aria-hidden="true"
            className="cutroom-playhead pointer-events-none absolute inset-x-3 bottom-3 top-6 z-10"
          >
            <div className="relative h-full w-0.5 bg-playhead">
              <div className="absolute -left-[3px] -top-1.5 h-2 w-2 rotate-45 rounded-[2px] bg-playhead" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Lane label="V2" tokens="bg-clip-text/70">
              <Clip className="w-[26%]" tokens="bg-clip-text/70" label="Title" />
              <Gap className="flex-1" />
              <Clip className="w-[18%]" tokens="bg-clip-text/70" label="Sticker" />
              <Gap className="w-[30%]" />
            </Lane>

            <Lane label="V1" tokens="bg-clip-video/70">
              <Clip className="w-[34%]" tokens="bg-clip-video/70" label="sunset.mp4" />
              <Seam />
              <Clip className="w-[28%]" tokens="bg-clip-video/70" label="b-roll.mp4" />
              <Seam />
              <Clip className="w-[22%]" tokens="bg-clip-video/70" label="drone.mp4" />
              <Gap className="w-[6%]" />
            </Lane>

            <Lane label="FX" tokens="bg-clip-effect/70">
              <Gap className="w-[12%]" />
              <Clip className="w-[30%]" tokens="bg-clip-effect/70" label={MOCK_PRESETS.firstEffect} />
              <Gap className="w-[10%]" />
              <Clip className="w-[26%]" tokens="bg-clip-effect/70" label={MOCK_PRESETS.secondEffect} />
              <Gap className="flex-1" />
            </Lane>

            <Lane label="A1" tokens="bg-clip-audio/70">
              <Clip className="w-[58%]" tokens="bg-clip-audio/70" label="voiceover" wave>
                <Wave />
              </Clip>
              <Gap className="w-[4%]" />
              <Clip className="w-[22%]" tokens="bg-clip-audio/70" label="bed" wave>
                <Wave offset={9} />
              </Clip>
              <Gap className="flex-1" />
            </Lane>
          </div>
        </div>
      </div>

      {/* floating chips outside the window: the things the editor actually does */}
      <div className="cutroom-float absolute -left-4 bottom-16 hidden rounded-lg border bg-card/90 px-3 py-2 text-xs shadow-lg backdrop-blur sm:block">
        <span className="font-mono uppercase tracking-widest text-muted-foreground">
          transition
        </span>
        <p className="mt-0.5 font-semibold">Orbit · 0.6 s</p>
      </div>
      <div
        className="cutroom-float absolute -right-3 top-24 hidden rounded-lg border bg-card/90 px-3 py-2 text-xs shadow-lg backdrop-blur sm:block"
        style={{ animationDelay: "-3s" }}
      >
        <span className="font-mono uppercase tracking-widest text-muted-foreground">captions</span>
        <p className="mt-0.5 font-semibold">SRT import · drag to retime</p>
      </div>
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Sparkles;
  label: string;
  tone: "effect" | "transition";
}) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 backdrop-blur ${
        tone === "effect"
          ? "bg-clip-effect/25 text-foreground ring-clip-effect/50"
          : "bg-clip-video/25 text-foreground ring-clip-video/50"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function Lane({
  label,
  tokens,
  children,
}: {
  label: string;
  tokens: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch gap-1.5">
      <span
        className={`flex w-7 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold uppercase text-background ${tokens}`}
      >
        {label}
      </span>
      <div className="flex flex-1 items-stretch gap-1.5">{children}</div>
    </div>
  );
}

function Clip({
  className,
  tokens,
  label,
  wave,
  children,
}: {
  className: string;
  tokens: string;
  label: string;
  wave?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex h-7 min-w-0 items-center overflow-hidden rounded-sm ring-1 ring-inset ring-white/15 ${tokens} ${className}`}
    >
      {wave && (children ?? <Wave />)}
      <span className="relative z-10 truncate px-1.5 font-mono text-[9px] text-background/90">
        {label}
      </span>
    </div>
  );
}

/** A transition sitting on the seam between two touching clips. */
function Seam() {
  return (
    <span className="relative -mx-1 z-10 grid h-7 w-4 shrink-0 place-items-center">
      <span className="cutroom-pulse h-3 w-3 rotate-45 rounded-[2px] bg-playhead shadow-[0_0_10px_2px_oklch(0.72_0.19_45_/_0.45)]" />
    </span>
  );
}

function Wave({ offset = 0 }: { offset?: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 flex items-center gap-[2px] px-1 opacity-60"
    >
      {WAVE.slice(offset).map((h, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 rounded-full bg-background/70"
          style={{ height: `${h}%` }}
        />
      ))}
    </span>
  );
}

function Gap({ className }: { className: string }) {
  return <span className={`shrink-0 ${className}`} />;
}
