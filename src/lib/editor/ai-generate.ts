/**
 * AI Studio shared helpers: prompt enrichment + base64/URL file plumbing + video task polling.
 * Pure and dependency-free so the same prompt builder runs server-side (generation) and in
 * tests, and nothing here pulls server code into the browser bundle.
 */
import { z } from "zod";

export const IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2"] as const;
export const VIDEO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;

/** Request shapes shared by the server functions and the client, validated once. */
export const voiceRequestSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  voiceId: z.string().min(1).max(64),
});
export const imageRequestSchema = z.object({
  // image-01 caps prompts at 1500 chars; the style block rides along, so the user text stops at 1000
  prompt: z.string().trim().min(3).max(1000),
  aspectRatio: z.enum(IMAGE_RATIOS),
  referenceImageUrl: z.string().url().max(4000).optional(),
});
/** Render styles offered in the studio — each maps to a real, distinct prompt block. */
export const VIDEO_STYLES = ["Realistic", "Cinematic", "Cartoon", "Pixar 3D", "Paper Art"] as const;
export type VideoStyle = (typeof VIDEO_STYLES)[number];
export const videoRequestSchema = z
  .object({
    prompt: z.string().trim().min(3).max(2000),
    style: z.enum(VIDEO_STYLES),
    firstFrameUrl: z.string().url().max(4000).optional(),
    lastFrameUrl: z.string().url().max(4000).optional(),
    refImageUrl: z.string().url().max(4000).optional(),
    refAudioUrl: z.string().url().max(4000).optional(),
    // MiniMax-H3 output spec: integer seconds 4-15, 768P or 2K; ratio drives text-to-video only
    duration: z.number().int().min(4).max(15),
    resolution: z.enum(["768P", "2K"]),
    ratio: z.enum(VIDEO_RATIOS).optional(),
  })
  // H3 keeps scene-frame and reference inputs on separate code paths: they cannot be mixed
  .superRefine((v, ctx) => {
    const frame = v.firstFrameUrl || v.lastFrameUrl;
    const ref = v.refImageUrl || v.refAudioUrl;
    if (frame && ref) {
      ctx.addIssue({
        code: "custom",
        message: "Scene-frame and reference inputs cannot be combined",
      });
    }
    if (v.lastFrameUrl && !v.firstFrameUrl) {
      ctx.addIssue({ code: "custom", message: "A last frame needs a first frame" });
    }
  });
export const videoQuerySchema = z.object({ taskId: z.string().min(1).max(128) });
export type VoiceRequest = z.infer<typeof voiceRequestSchema>;
export type ImageRequest = z.infer<typeof imageRequestSchema>;
export type VideoRequest = z.infer<typeof videoRequestSchema>;

export interface VideoTaskStatus {
  status: string;
  url?: string | undefined;
  error?: string | undefined;
}

/** The visual language each studio style resolves to inside one generation request. */
export function videoStyleBlock(style: VideoStyle): string {
  switch (style) {
    case "Realistic":
      return (
        `Render hyper-realistic live-action footage true to the described scene: natural photographic ` +
        `camera look, true-to-life skin and fabric textures, realistic materials, natural lighting and ` +
        `color, physically accurate weight, momentum and motion blur, lifelike micro-expressions and ` +
        `gestures, subtle real-world imperfections, shallow cinematic depth. No cartoon, 3D-render, CGI, ` +
        `plastic or stylized look.`
      );
    case "Cinematic":
      return (
        `Render as live-action feature-film footage: anamorphic cinema lens, shallow depth of field, ` +
        `dramatic motivated lighting, subtle film grain and a professional color grade. Subjects, ` +
        `physics and performances stay fully real — a cinematic treatment, never cartoon or CGI.`
      );
    case "Cartoon":
      return (
        `Render as a hand-drawn 2D cartoon: bold clean outlines, flat vibrant colors, expressive ` +
        `squash-and-stretch movement and classic cel-animation shading, consistent across every frame.`
      );
    case "Pixar 3D":
      return (
        `Render as a high-end 3D animated feature in the Pixar style: expressive stylized character ` +
        `proportions, big readable emotions, soft subsurface-scattering skin, warm physically based ` +
        `lighting and rich set detail in a polished cinematic look, consistent across every frame.`
      );
    case "Paper Art":
      return (
        `Render as an intricate layered paper-craft world: characters, props and scenery are all ` +
        `sculpted from cut and folded colored paper with visible paper grain, feathered cut edges and ` +
        `soft handmade shadows, animated in stop-motion style with a gliding camera through the scene.`
      );
  }
}

/**
 * Generation models read the whole string as scene content, so the user's description always
 * comes first and extra wording only follows it — meta-instructions like "Create EXACTLY..."
 * were burying the subject and pulling output toward generic filler instead of the idea.
 */
export function enhanceVideoPrompt(
  prompt: string,
  style: VideoStyle = "Realistic",
  spoken = false,
): string {
  const speak = spoken
    ? `A character speaks out loud in this scene. Lock the lip movement, mouth shapes, breathing and ` +
      `facial acting in perfect sync with the spoken words; the voice timbre follows reference audio 1.`
    : "";
  return [prompt.trim(), videoStyleBlock(style), speak].filter(Boolean).join("\n\n");
}

/** Style vocabulary the user already chose in their own words; the tail must not fight it. */
const USER_STYLE_WORDS =
  /\b(cartoon|anime|manga|comic|illustration|illustrated|painting|painted|watercolou?r|sketch|drawing|3d|cgi|pixel|oil|acrylic|clay|paper|stop-motion|poster|sculpture)\b/i;

/**
 * Stills want one flowing visual caption: the described scene first, then quality tail only
 * when the user did not ask for an artistic style themselves. With a reference image the
 * subject must stay recognisably the one provided.
 */
export function enhanceImagePrompt(prompt: string, hasReference = false): string {
  const base = prompt.trim().replace(/[.,\s]+$/, "");
  const parts = [base];
  if (!USER_STYLE_WORDS.test(base))
    parts.push("photorealistic with natural lighting and true-to-life textures");
  parts.push("highly detailed with a coherent composition");
  if (hasReference)
    parts.push("the main subject stays faithfully recognisable from the reference image");
  return [parts.join(", "), "."].join("");
}

/** Deterministic, readable asset name for generated media (kept short + extension-safe). */
export function generatedName(prefix: string, prompt: string, ext: string): string {
  const slug = prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = prefix.replace(/-+$/, "");
  return `${base}${slug ? `-${slug}` : ""}.${ext}`;
}

export function base64ToFile(b64: string, mime: string, name: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** Pull a finished generated file (MiniMax returns a download URL) into a File for upload. */
export async function fetchUrlToFile(url: string, mime: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("The generated file could not be downloaded");
  return new File([await res.blob()], name, { type: mime });
}

/**
 * Poll an async video task until it settles. Read-only status queries are throttled by the
 * provider (docs recommend ~10 s), so the interval only waits between successful reads;
 * transient query errors retry, abort and the overall deadline stop the loop.
 */
export async function pollVideoTask(
  query: (taskId: string) => Promise<VideoTaskStatus>,
  taskId: string,
  opts: {
    onStatus: (s: VideoTaskStatus) => void;
    signal: AbortSignal;
    intervalMs?: number | undefined;
    timeoutMs?: number | undefined;
  },
): Promise<string> {
  const interval = opts.intervalMs ?? 10_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 20 * 60_000);
  for (;;) {
    if (opts.signal.aborted) throw new Error("Cancelled");
    const st = await query(taskId);
    opts.onStatus(st);
    if (st.status === "succeeded") {
      if (!st.url) throw new Error("The video was finished but no download URL was returned");
      return st.url;
    }
    if (st.status === "failed" || st.status === "cancelled")
      throw new Error(`Video generation ${st.status}${st.error ? `: ${st.error}` : ""}`);
    if (Date.now() > deadline) throw new Error("Video generation timed out. Please try again.");
    await new Promise<void>((resolve, reject) => {
      const id = setTimeout(resolve, interval);
      opts.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(new Error("Cancelled"));
        },
        { once: true },
      );
    });
  }
}
