import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_DESCRIPTION,
  APP_PATH,
  AUTH_PATH,
  EXPORT_SPECS,
  FAQS,
  FEATURES,
  MOCK_PRESETS,
  NAV_LINKS,
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
import { EFFECTS, FILTERS } from "@/lib/editor/fx";
import { TRANSITIONS } from "@/lib/editor/transitions";
import { ART_STICKERS } from "@/lib/editor/stickers";

// Competitor and starter-template platform names must never reach a product surface, a doc or a
// code comment: the page presents this editor as original work, so a brand mention is both a false
// claim and a trademark risk. They are assembled from fragments so that searching the repository
// for any of them returns nothing - this guard file included.
const FORBIDDEN_NAME_PARTS = [
  ["cap", "cut"],
  ["love", "able"],
  ["ado", "be"],
  ["pre", "miere"],
  ["final", " cut"],
  ["film", "ora"],
  ["da", "vinci"],
  ["kden", "live"],
  ["in", "shot"],
  ["re", "motion"],
] as const;
const FORBIDDEN_NAMES = FORBIDDEN_NAME_PARTS.map(([head, tail]) => head + tail);

/** Source trees that ship with the product. */
const SCAN_ROOTS = ["src", "public", "drizzle", "supabase/migrations"];
/** Root-level files that describe or configure it. */
const SCAN_FILES = [
  "README.md",
  "AGENTS.md",
  "roadmap.md",
  ".gitignore",
  ".env.example",
  "package.json",
  "components.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "eslint.config.js",
  "drizzle.config.ts",
];
const TEXT_FILE = /\.(?:ts|tsx|js|cjs|css|md|json|sql|svg|txt|html|toml)$/;

function textUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return textUnder(path);
    return TEXT_FILE.test(entry.name) ? [readFileSync(path, "utf8")] : [];
  });
}

// The landing page makes claims and promises anchors. These checks keep both honest without
// rendering a route that needs a router and a live auth session.

/** Everything the page can print, as one searchable body of copy. */
const COPY = {
  SITE_TITLE,
  SITE_DESCRIPTION,
  OG_DESCRIPTION,
  APP_DESCRIPTION,
  NAV_LINKS,
  STATS,
  FEATURES,
  STEPS,
  PRINCIPLES,
  TRANSITION_GROUPS,
  EXPORT_SPECS,
  PRO_COMING_SOON,
  MOCK_PRESETS,
  FAQS,
} as const;

/** Every sentence in the copy, whatever nesting it came from. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const corpus = () => strings(COPY).join(" ").toLowerCase();

describe("Landing page content", () => {
  it("sends every call-to-action to a real app route", () => {
    expect(APP_PATH).toBe("/projects");
    expect(AUTH_PATH).toBe("/auth");

    for (const path of [APP_PATH, AUTH_PATH]) {
      expect(path.startsWith("/")).toBe(true);
      expect(path).not.toContain("#");
    }
  });

  it("only links nav anchors to sections the page declares", () => {
    const ids = Object.values(SECTIONS) as string[];
    expect(new Set(ids).size).toBe(ids.length);
    for (const link of NAV_LINKS) {
      expect(ids).toContain(link.href.slice(1));
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps feature copy complete", () => {
    expect(FEATURES.length).toBeGreaterThanOrEqual(6);
    for (const f of FEATURES) {
      expect(f.title.length).toBeGreaterThan(2);
      expect(f.body.length).toBeGreaterThan(30);
      expect(f.icon).toBeTruthy();
    }
    expect(STEPS).toHaveLength(4);
    expect(FAQS.length).toBeGreaterThanOrEqual(5);
    for (const f of FAQS) {
      expect(f.a.length).toBeGreaterThan(60);
    }
    expect(PRINCIPLES.length).toBe(3);
    expect(EXPORT_SPECS.some((row) => row.k === "Container" && row.v === "MP4")).toBe(true);
  });

  it("advertises the catalog the editor really ships", () => {
    // the numbers in the stats band are hand-written copy, so they are checked against the real
    // catalogs a test can afford to import (the landing route itself must not bundle them)
    const sizes: Record<string, number> = {
      "filters & grades": FILTERS.length,
      "video effects": EFFECTS.length,
      transitions: TRANSITIONS.length,
      "animated stickers": ART_STICKERS.length,
    };
    for (const stat of STATS) {
      // an unknown label is a new number nobody measured, so it fails the same way a wrong one does
      expect(sizes[stat.label], `stats entry "${stat.label}" is not measured`).toBe(
        Number(stat.value),
      );
    }
    expect(TRANSITION_GROUPS.length).toBe(new Set(TRANSITIONS.map((t) => t.group)).size);
  });

  it("quotes catalog sizes in the metadata that the engine agrees with", () => {
    const digits = (text: string, word: string) =>
      Number(text.match(new RegExp(`(\\d+) ${word}`))?.[1] ?? -1);
    expect(digits(SITE_DESCRIPTION, "filters")).toBe(FILTERS.length);
    expect(digits(SITE_DESCRIPTION, "transitions")).toBe(TRANSITIONS.length);
  });

  it("names only presets in the hero mock that the editor can actually apply", () => {
    const filterNames = new Set(FILTERS.map((f) => f.name));
    const effectNames = new Set(EFFECTS.map((e) => e.name));
    const transitionNames = new Set(TRANSITIONS.map((t) => t.name));
    expect(filterNames.has(MOCK_PRESETS.filter), MOCK_PRESETS.filter).toBe(true);
    expect(transitionNames.has(MOCK_PRESETS.transition), MOCK_PRESETS.transition).toBe(true);
    for (const name of [MOCK_PRESETS.firstEffect, MOCK_PRESETS.secondEffect]) {
      expect(effectNames.has(name), name).toBe(true);
    }
  });

  it("sells no AI feature as if it worked", () => {
    // these were the false claims: an auto-caption/transcription pipeline and a translated-caption
    // count, both of which the editor now gates behind the Pro version
    for (const banned of [
      "ai captions",
      "ai subtitle",
      "auto-caption",
      "auto-captioning",
      "transcrib",
      "auto-generate captions",
      "caption languages",
      "20 languages",
      "server-side",
      "entirely in your tab",
      "nothing server",
      "segmentation",
    ]) {
      expect(corpus(), `landing copy must not claim "${banned}"`).not.toContain(banned);
    }
  });

  it("only mentions a gated capability where it says Pro", () => {
    const gated = [
      /\bAI\b/,
      /auto(?:matic)?[ -]caption/i,
      /transcrib/i,
      /speech-to-text/i,
      /avatar/i,
      /translat/i,
    ];
    // the Pro list is allowed to name the features because the section heading labels them
    const named = strings({
      SITE_TITLE,
      SITE_DESCRIPTION,
      OG_DESCRIPTION,
      APP_DESCRIPTION,
      FEATURES,
      STEPS,
      PRINCIPLES,
      EXPORT_SPECS,
      FAQS,
    });
    let labelled = 0;
    for (const text of named) {
      if (!gated.some((re) => re.test(text))) continue;
      labelled++;
      expect(text, "gated capability advertised without a Pro label").toMatch(
        /\bpro\b|coming soon/i,
      );
    }
    // the FAQ does talk about the Pro pipeline, so a zero here means the scan stopped matching anything
    expect(labelled).toBeGreaterThan(0);
  });

  it("lists the Pro pipeline as coming soon rather than as a feature", () => {
    expect(PRO_COMING_SOON.length).toBeGreaterThan(0);
    for (const item of PRO_COMING_SOON) expect(item.length).toBeGreaterThan(10);
  });

  it("only shows grades that exist in the engine catalog, with a drawable swatch", () => {
    const showcase = GENERATED_FILTERS.filter((_, i) => i % 7 === 0).slice(0, 24);
    expect(showcase.length).toBe(24);
    for (const f of showcase) {
      expect(f.name.length).toBeGreaterThan(1);
      expect(f.swatch).toContain("linear-gradient");
    }
  });

  it("stays white-labelled - no third-party platform or competitor branding in the copy", () => {
    const body = corpus();
    for (const name of FORBIDDEN_NAMES) {
      expect(body, name).not.toContain(name);
    }
  });

  it("keeps those names out of every source file, doc and comment, not just the page copy", () => {
    const scanned = SCAN_ROOTS.filter((root) => existsSync(root)).flatMap(textUnder);
    const loose = SCAN_FILES.filter((file) => existsSync(file)).map((file) =>
      readFileSync(file, "utf8"),
    );
    // A guard that read nothing would pass vacuously, so insist on real coverage.
    expect(scanned.length + loose.length).toBeGreaterThan(120);
    const haystack = [...scanned, ...loose].join("\n").toLowerCase();
    for (const name of FORBIDDEN_NAMES) {
      expect(haystack, name).not.toContain(name);
    }
  });
});
