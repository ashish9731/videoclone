/**
 * AI Assist shared helpers: OpenRouter-backed text generation shapes.
 * Pure and dependency-free (like ai-generate.ts) so prompt building and response parsing
 * run server-side and in tests without pulling server code into the browser bundle.
 */
import { z } from "zod";

/** What the assist can produce for a project, from one short description or script. */
export const ASSIST_KINDS = ["title", "description", "tags", "captions"] as const;
export type AssistKind = (typeof ASSIST_KINDS)[number];

export const assistRequestSchema = z.object({
  kind: z.enum(ASSIST_KINDS),
  input: z.string().trim().min(3).max(4000),
});
export type AssistRequest = z.infer<typeof assistRequestSchema>;

export interface AssistResult {
  titles?: string[];
  description?: string;
  tags?: string[];
  lines?: string[];
}

/** Per-kind instruction; each demands strict JSON so parsing is deterministic, never decorative. */
export function assistPrompt(kind: AssistKind, input: string): string {
  const task =
    kind === "title"
      ? "Write 5 short, specific video title options for this content. No clickbait the content does not support."
      : kind === "description"
        ? "Write one engaging video description (2-4 sentences) for this content."
        : kind === "tags"
          ? "Suggest 12 relevant discovery tags for this content: no duplicates, no misleading trend-jacking."
          : "Split the content into short on-screen caption lines of at most 42 characters each. Keep the wording; only break lines at natural speech pauses. 1-25 lines.";
  const payload =
    kind === "captions"
      ? `Content/script:\n"""${input}"""`
      : `Content description:\n"""${input}"""`;
  const shape =
    kind === "title"
      ? '{"titles":["...","..."]}'
      : kind === "description"
        ? '{"description":"..."}'
        : kind === "tags"
          ? '{"tags":["..."]}'
          : '{"lines":["...","..."]}';
  return (
    `You are a video editor's writing assistant. ${task}\n\n${payload}\n\n` +
    `Respond with ONLY one JSON object exactly in this shape, no markdown fences, no commentary:\n${shape}`
  );
}

/**
 * Extract the JSON object a chat model returned: tolerates surrounding prose or ``` fences,
 * rejects anything that is not one parseable object with the expected key.
 */
export function parseAssistResponse(text: string, kind: AssistKind): AssistResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("The AI returned an unreadable answer. Please try again.");
  const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const strings = (v: unknown, cap: number): string[] =>
    Array.isArray(v)
      ? v
          .map((x) => String(x).trim())
          .filter(Boolean)
          .slice(0, cap)
      : [];
  switch (kind) {
    case "title": {
      const titles = strings(obj["titles"], 5);
      if (!titles.length) throw new Error("The AI returned no titles. Please try again.");
      return { titles };
    }
    case "description": {
      const description = typeof obj["description"] === "string" ? obj["description"].trim() : "";
      if (!description) throw new Error("The AI returned no description. Please try again.");
      return { description };
    }
    case "tags": {
      const tags = [
        ...new Set(
          strings(obj["tags"], 12).map((t) =>
            t.toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-"),
          ),
        ),
      ];
      if (!tags.length) throw new Error("The AI returned no tags. Please try again.");
      return { tags };
    }
    case "captions": {
      const lines = strings(obj["lines"], 25).map((l) => l.slice(0, 80));
      if (!lines.length) throw new Error("The AI returned no caption lines. Please try again.");
      return { lines };
    }
  }
}

export interface CueChunk {
  text: string;
  chars: number;
}

/** Break assist caption lines into cue-sized chunks (the panel's 42-char reading width). */
export function chunkCaptionLines(lines: string[], maxChars = 42): string[] {
  const out: string[] = [];
  for (const line of lines) {
    let rest = line.trim();
    if (!rest) continue;
    while (rest.length > maxChars) {
      // prefer the last space before the cap; hard-cut only for unbroken long words
      let cut = rest.lastIndexOf(" ", maxChars);
      if (cut <= 0) cut = maxChars;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/**
 * Pace caption chunks evenly-but-proportionally across a duration: each cue owns a slice of
 * time proportional to its character count, so longer lines stay on screen longer.
 */
export function distributeCues(
  chunks: CueChunk[],
  durationSec: number,
): { start: number; end: number; text: string }[] {
  const total = chunks.reduce((n, c) => n + c.chars, 0) || 1;
  const span = durationSec > 0 ? durationSec : chunks.length;
  let t = 0;
  return chunks.map((c, i) => {
    const d = (span * c.chars) / total;
    const cue = { start: t, end: i === chunks.length - 1 ? span : t + d, text: c.text };
    t += d;
    return cue;
  });
}

/** Caption-translation prompt: one JSON object, every id exactly once, subtitle-sized output. */
export function translationPrompt(target: string, cues: { id: string; text: string }[]): string {
  return (
    `You translate video subtitles. Translate each cue's text into ${target}. ` +
    `Keep it natural, concise and suitable for on-screen subtitles; preserve meaning and tone. ` +
    `Return every id exactly once.\n\nCues (JSON):\n${JSON.stringify(cues)}\n\n` +
    `Respond with ONLY one JSON object, no markdown fences, no commentary:\n` +
    `{"translations":[{"id":"...","text":"..."}]}`
  );
}

/**
 * Pull the translations array out of a chat answer, keeping only entries whose id exists in the
 * request; the panel falls back to the original text for anything missing, never duplicates.
 */
export function parseTranslationResponse(
  text: string,
  ids: string[],
): { id: string; text: string }[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("The AI returned an unreadable translation. Please try again.");
  const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const raw = Array.isArray(obj["translations"]) ? (obj["translations"] as unknown[]) : [];
  const known = new Set(ids);
  const seen = new Set<string>();
  const out: { id: string; text: string }[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const id = typeof o?.["id"] === "string" ? o["id"] : "";
    const t = typeof o?.["text"] === "string" ? o["text"].trim() : "";
    if (id && t && known.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push({ id, text: t });
    }
  }
  if (!out.length) throw new Error("The AI returned no translations. Please try again.");
  return out;
}

// ─── Generation-prompt writer: AI Enhance + idea-to-prompt for the Image/Video sections ───

export const PROMPT_TARGETS = ["image", "video"] as const;
export const PROMPT_MODES = ["enhance", "write"] as const;

export const promptWriterSchema = z.object({
  target: z.enum(PROMPT_TARGETS),
  // enhance: polish a draft while keeping every idea; write: expand a plain-language idea
  mode: z.enum(PROMPT_MODES),
  idea: z.string().trim().min(3).max(2000),
  style: z.string().trim().max(40).optional(),
});
export type PromptWriterRequest = z.infer<typeof promptWriterSchema>;

/** One chat turn that returns a ready-to-generate prompt as strict JSON. */
export function promptWriterPrompt(req: PromptWriterRequest): string {
  const medium = req.target === "image" ? "image" : "video";
  const task =
    req.mode === "enhance"
      ? `Rewrite this draft ${medium}-generation prompt into one stronger prompt. Keep every subject, action, setting and mood from the draft — never drop, replace or contradict an idea; only add concrete visual detail.`
      : `Turn this plain-language idea into one detailed ${medium}-generation prompt. Stay faithful to the idea and add only detail that it clearly implies.`;
  const style = req.style
    ? ` Render style to write for: ${req.style} — the wording must fit that style.`
    : "";
  const detail =
    req.target === "image"
      ? "Describe a single frozen frame: main subject and its look, action or pose, environment, lighting, time of day, camera lens and framing, composition, color palette, mood."
      : "Describe motion over time: subject and its action, environment and atmosphere, camera movement and framing, lighting, pacing, and how the shot ends.";
  return (
    `You are an expert prompt engineer for AI ${medium} generation.\n\n${task}${style}\n\n${detail}\n\n` +
    `Rules: 40-140 words; a direct visual description in flowing sentences; no instructions to the model (never "create", "generate", "make"), no quotes, no questions, no lists; do not mention the AI itself.\n\n` +
    `Idea:\n"""${req.idea}"""\n\n` +
    `Respond with ONLY one JSON object, no markdown fences, no commentary:\n{"prompt":"..."}`
  );
}

/** Pull the written prompt out of the chat answer; refuse empty or unreadable replies. */
export function parsePromptWrite(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("The AI returned an unreadable prompt. Please try again.");
  const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const prompt = typeof obj["prompt"] === "string" ? obj["prompt"].trim() : "";
  if (!prompt) throw new Error("The AI returned no prompt. Please try again.");
  return clampPrompt(prompt, 2000);
}

/** Cut oversized text at the last word boundary within max — keeps refilled textareas valid. */
export function clampPrompt(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
}
