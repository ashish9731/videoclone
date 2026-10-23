import {
  Captions,
  Download,
  KeySquare,
  Layers,
  Music2,
  Sparkles,
  Sticker,
  WandSparkles,
} from "lucide-react";

/** Where every call-to-action on the marketing page goes: the signed-in app. */
export const APP_PATH = "/projects";
export const AUTH_PATH = "/auth";

/** Anchor targets that the sections in routes/index.tsx must render. */
export const SECTIONS = {
  features: "features",
  library: "library",
  workflow: "workflow",
  export: "export",
  faq: "faq",
} as const;

export const NAV_LINKS = [
  { href: `#${SECTIONS.features}`, label: "Features" },
  { href: `#${SECTIONS.library}`, label: "Library" },
  { href: `#${SECTIONS.workflow}`, label: "How it works" },
  { href: `#${SECTIONS.export}`, label: "Export" },
  { href: `#${SECTIONS.faq}`, label: "FAQ" },
] as const;

/**
 * Catalog sizes as measured from the engine today (`FILTERS`, `EFFECTS`, `TRANSITIONS`,
 * `ART_STICKERS` in src/lib/editor). They are written out instead of imported because those modules
 * pull the whole canvas/WebCodecs engine into the public landing bundle, and src/test/landing.test.ts
 * checks each one against the real catalog so this copy cannot drift into an invented number.
 * Nothing that is a Pro-only feature is counted here.
 */
export const STATS = [
  { value: "252", label: "filters & grades" },
  { value: "116", label: "video effects" },
  { value: "64", label: "transitions" },
  { value: "198", label: "animated stickers" },
] as const;

/**
 * The page's own claims, kept as data so a test can read them: every number here is checked against
 * the engine, and no feature the editor gates behind Pro is advertised.
 */
export const SITE_TITLE = "Cutroom — Multi-track video editor that renders in your tab";
export const SITE_DESCRIPTION =
  "Edit video in your browser: multi-track timeline, 252 filters, 64 transitions, keyframes, editable subtitle lanes and MP4 export with no render queue.";
export const OG_DESCRIPTION =
  "A real timeline editor that renders in your tab — grades, transitions, caption lanes and WebCodecs MP4 export.";
/** The document description the signed-in app carries. */
export const APP_DESCRIPTION =
  "Edit video on a real multi-track timeline, caption it and export MP4 in your browser.";

export const FEATURES = [
  {
    icon: Layers,
    title: "Multi-track timeline",
    body: "Video, images, audio, text and full-frame effect blocks on any lane. Drag, trim, split, ripple and snap.",
  },
  {
    icon: WandSparkles,
    title: "Filters that grade real pixels",
    body: "252 photographic looks plus manual exposure, shadow, highlight, HSL-style vibrance and grain — colour matrices, not CSS overlays.",
  },
  {
    icon: Sparkles,
    title: "Effects & transitions",
    body: "Camera moves, 3D and shape seams, bloom, chroma key and shape masks, computed on the pixels in your tab.",
  },
  {
    icon: KeySquare,
    title: "Keyframes & speed ramps",
    body: "Animate position, scale, rotation and opacity per clip, and draw piecewise speed curves that audio follows.",
  },
  {
    icon: Captions,
    title: "Captions on their own lane",
    body: "Import an .srt/.vtt or add cues at the playhead, drag a line to retime it, style the track and burn it into the export.",
  },
  {
    icon: Music2,
    title: "Audio that ducks itself",
    body: "Volume envelopes, fades, library SFX and automatic ducking under voice clips — one gain function for preview and export.",
  },
  {
    icon: Sticker,
    title: "Stickers & shapes",
    body: "198 vector stickers across Love, Party, Weather, Nature, Food and more, each with its own motion preset.",
  },
  {
    icon: Download,
    title: "Browser MP4 export",
    body: "WebCodecs encoding that prefers H.264/AAC and falls back to VP9/AV1 + Opus. No render farm, no queue, no watermark.",
  },
] as const;

export const STEPS = [
  {
    n: "01",
    title: "Sign in, new project",
    body: "Google or email. Pick 16:9, 9:16, 1:1 or 4:5 — the frame you need for the platform you are posting to.",
  },
  {
    n: "02",
    title: "Drop your footage",
    body: "Clips land in your private storage bucket and play back through signed URLs. Trim and split on the timeline.",
  },
  {
    n: "03",
    title: "Cut, grade, caption",
    body: "Filters, transitions and effect blocks go anywhere on the timeline. Subtitles get a lane of their own.",
  },
  {
    n: "04",
    title: "Export and ship",
    body: "The same renderer that drew your preview encodes the file in this tab. Download it when the bar finishes.",
  },
] as const;

export const PRINCIPLES = [
  {
    title: "One renderer",
    body: "Preview and export call the same renderFrame, so a grade you liked at full screen is the grade in the file.",
  },
  {
    title: "No render farm",
    body: "Cutting, colour, compositing and encoding all happen in your tab. The server stores your project and your media; it never processes a frame of them.",
  },
  {
    title: "Smooth under load",
    body: "The preview measures each frame and trades resolution for frame rate on heavy stacks — then restores full quality the moment you pause.",
  },
] as const;

export const TRANSITION_GROUPS = [
  "Basic",
  "Slide",
  "Wipe",
  "Camera",
  "Effects",
  "Shape",
  "3D",
  "Film",
  "Flash",
] as const;

export const EXPORT_SPECS = [
  { k: "Container", v: "MP4" },
  { k: "Video", v: "H.264 · VP9 · AV1 (browser dependent)" },
  { k: "Audio", v: "AAC, falls back to Opus" },
  { k: "Formats", v: "1920×1080 · 1080×1920 · 1080×1080 · 1080×1350" },
  { k: "Encoder", v: "WebCodecs, in your tab" },
  { k: "Captions", v: "Burned into the picture" },
] as const;

/**
 * Advertised as what is not yet shipped rather than hidden: these are the AI features the editor
 * gates behind the Pro version, listed here so the page can say it in one place.
 */
export const PRO_COMING_SOON = [
  "Automatic speech-to-text captions",
  "Caption translation",
  "AI portrait effects — background removal and portrait blur",
  "Talking AI avatar",
] as const;

/**
 * Catalog names the hero mock shows as if they were blocks on its timeline. They are exported for
 * the same reason as the stats: src/test/landing.test.ts proves each one is a real engine entry,
 * so the illustration cannot advertise a look the editor does not have.
 */
export const MOCK_PRESETS = {
  filter: "Amber Film",
  transition: "Cube",
  firstEffect: "Bloom",
  secondEffect: "Vignette",
} as const;

export const FAQS = [
  {
    q: "Do I have to upload my video somewhere to be processed?",
    a: "No. Your media is stored in your own private storage bucket so it survives a refresh, and it comes back to the tab over signed URLs. Every edit, effect and the export itself run locally in your browser — there is no render queue and no watermark.",
  },
  {
    q: "Which browsers work best?",
    a: "Chrome and Edge give you H.264/AAC through WebCodecs. Where the browser cannot encode H.264, Cutroom automatically falls back to VP9 or AV1 video with Opus audio in the same MP4 container, so the export still finishes.",
  },
  {
    q: "Can Cutroom caption my video automatically?",
    a: "Not in this build. Speech-to-text, caption translation and the AI portrait effects are coming in the Pro version, and the editor says so the moment you try one. The rest of the caption workflow works today: import an .srt/.vtt, add cues at the playhead, retime them on the lane, style the track, and the text burns into the export.",
  },
  {
    q: "Can I bring my own subtitles?",
    a: "Yes — import an SRT or VTT file and the cues become an editable caption track on its own lane, with per-line retiming and per-track styling, and the text is burned into the exported picture.",
  },
  {
    q: "What happens when a heavy timeline gets slow?",
    a: "The preview times every frame it draws and steps its own resolution down until the playback rate fits your project's fps. It climbs back up when the load drops, and paused or scrubbed frames are always drawn at full quality. Exports are never downscaled.",
  },
  {
    q: "Is my project saved?",
    a: "The timeline is stored as JSON against your account and caption tracks are saved per track, so you can close the tab, open My projects on another device and pick up the same cut.",
  },
] as const;
