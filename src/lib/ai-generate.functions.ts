import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  enhanceImagePrompt,
  enhanceVideoPrompt,
  imageRequestSchema,
  videoQuerySchema,
  videoRequestSchema,
  voiceRequestSchema,
} from "@/lib/editor/ai-generate";

/**
 * AI Studio proxies. API keys live only in server env vars; every call requires a verified
 * Supabase session, and paid generation endpoints share a small per-user throttle because the
 * keys are billed account-wide.
 */

const MINIMAX_URL = "https://api.minimax.io";
const ELEVENLABS_URL = "https://api.elevenlabs.io";

const GEN_CALLS_PER_MIN = 8;
const recentCalls = new Map<string, number[]>();
function throttle(userId: string) {
  const now = Date.now();
  const hits = (recentCalls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= GEN_CALLS_PER_MIN)
    throw new Error("Too many AI generation requests. Please wait a minute.");
  hits.push(now);
  recentCalls.set(userId, hits);
  if (recentCalls.size > 500) recentCalls.clear();
}

function minimaxKey(): string {
  const key = process.env["MINIMAX_API_KEY"];
  if (!key) throw new Error("Image/video generation is not configured");
  return key;
}

function elevenLabsKey(): string {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("AI voices are not configured");
  return key;
}

async function jsonOrThrow(res: Response, failMessage: string): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const detail =
      typeof body?.["detail"] === "string"
        ? (body["detail"] as string)
        : typeof body?.["message"] === "string"
          ? (body["message"] as string)
          : res.status === 401
            ? "the API key was rejected"
            : `HTTP ${res.status}`;
    throw new Error(`${failMessage}: ${detail}`);
  }
  return body ?? {};
}

// ─── ElevenLabs voices ────────────────────────────────────────────────────────

export interface AiVoice {
  id: string;
  name: string;
  labels: string;
}

let voicesCache: { at: number; voices: AiVoice[] } | null = null;

export const listAiVoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AiVoice[]> => {
    if (voicesCache && Date.now() - voicesCache.at < 3_600_000) return voicesCache.voices;
    const res = await fetch(`${ELEVENLABS_URL}/v1/voices`, {
      headers: { "xi-api-key": elevenLabsKey() },
    });
    const body = await jsonOrThrow(res, "Could not load the voice list");
    const raw = Array.isArray(body["voices"]) ? (body["voices"] as unknown[]) : [];
    const voices: AiVoice[] = raw
      .map((v) => {
        const o = v as Record<string, unknown>;
        const labels = o["labels"];
        const labelText =
          labels && typeof labels === "object"
            ? Object.values(labels as Record<string, unknown>)
                .filter((x): x is string => typeof x === "string")
                .slice(0, 3)
                .join(" · ")
            : "";
        return {
          id: String(o["voice_id"] ?? ""),
          name: String(o["name"] ?? "Voice"),
          labels: labelText,
        };
      })
      .filter((v) => v.id);
    voicesCache = { at: Date.now(), voices };
    return voices;
  });

const voiceSchema = voiceRequestSchema;

export const generateVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => voiceSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ audioBase64: string; mime: string }> => {
    throttle(context.userId);
    const res = await fetch(
      `${ELEVENLABS_URL}/v1/text-to-speech/${encodeURIComponent(data.voiceId)}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey(),
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_multilingual_v2",
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const msg =
        detail && typeof detail["detail"] === "object"
          ? String((detail["detail"] as Record<string, unknown>)["message"] ?? res.status)
          : `HTTP ${res.status}`;
      throw new Error(`Voice generation failed: ${msg}`);
    }
    const buf = await res.arrayBuffer();
    return { audioBase64: Buffer.from(buf).toString("base64"), mime: "audio/mpeg" };
  });

// ─── MiniMax image generation ─────────────────────────────────────────────────

const imageSchema = imageRequestSchema;

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => imageSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ imagesBase64: string[] }> => {
    throttle(context.userId);
    const payload: Record<string, unknown> = {
      model: "image-01",
      prompt: enhanceImagePrompt(data.prompt, !!data.referenceImageUrl),
      aspect_ratio: data.aspectRatio,
      response_format: "base64",
      // image-01's own optimizer re-reads the description into model-native wording; without it
      // short natural-language prompts drifted to unrelated generic scenes
      prompt_optimizer: true,
    };
    if (data.referenceImageUrl) {
      payload["subject_reference"] = [{ type: "character", image_file: data.referenceImageUrl }];
    }
    const res = await fetch(`${MINIMAX_URL}/v1/image_generation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${minimaxKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await jsonOrThrow(res, "Image generation failed");
    const baseResp = body["base_resp"] as { status_code?: number; status_msg?: string } | undefined;
    if (baseResp && baseResp.status_code !== 0)
      throw new Error(`Image generation failed: ${baseResp.status_msg ?? "provider error"}`);
    const dataObj = body["data"] as { image_base64?: unknown } | undefined;
    const list = Array.isArray(dataObj?.image_base64) ? (dataObj.image_base64 as unknown[]) : [];
    const images = list.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (!images.length) throw new Error("Image generation returned no image");
    return { imagesBase64: images };
  });

// ─── MiniMax video generation (MiniMax-H3, async task) ────────────────────────

const videoSchema = videoRequestSchema;

export const createVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => videoSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ taskId: string }> => {
    throttle(context.userId);
    const spoken = !!data.refAudioUrl;
    const content: Record<string, unknown>[] = [
      { type: "text", text: enhanceVideoPrompt(data.prompt, data.style, spoken) },
    ];
    const frame = data.firstFrameUrl || data.lastFrameUrl;
    if (frame) {
      // image-to-video: scene frames drive the shot (schema keeps refs out of this mode)
      content.push({
        type: "image_url",
        image_url: { url: data.firstFrameUrl },
        role: "first_frame",
      });
      if (data.lastFrameUrl)
        content.push({
          type: "image_url",
          image_url: { url: data.lastFrameUrl },
          role: "last_frame",
        });
    } else {
      // reference-to-video: character look and/or a voice clip for synced dialogue
      if (data.refImageUrl)
        content.push({
          type: "image_url",
          image_url: { url: data.refImageUrl },
          role: "reference_image",
        });
      if (data.refAudioUrl)
        content.push({
          type: "audio_url",
          audio_url: { url: data.refAudioUrl },
          role: "reference_audio",
        });
    }
    const payload: Record<string, unknown> = {
      model: "MiniMax-H3",
      content,
      duration: data.duration,
      resolution: data.resolution,
    };
    // explicit ratios only drive plain text-to-video; media-conditioned runs adapt to the input
    payload["ratio"] = content.length > 1 ? "adaptive" : (data.ratio ?? "16:9");
    const res = await fetch(`${MINIMAX_URL}/v2/video_generation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${minimaxKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await jsonOrThrow(res, "Video generation failed");
    const baseResp = body["base_resp"] as { status_code?: number; status_msg?: string } | undefined;
    if (baseResp && baseResp.status_code !== 0)
      throw new Error(`Video generation failed: ${baseResp.status_msg ?? "provider error"}`);
    const taskId = body["task_id"];
    if (typeof taskId !== "string" || !taskId)
      throw new Error("Video provider returned no task id");
    return { taskId };
  });

const querySchema = videoQuerySchema;

export const queryVideoTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => querySchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ status: string; url?: string | undefined; error?: string | undefined }> => {
      const res = await fetch(
        `${MINIMAX_URL}/v2/query/video_generation/${encodeURIComponent(data.taskId)}`,
        { headers: { Authorization: `Bearer ${minimaxKey()}` } },
      );
      const body = await jsonOrThrow(res, "Could not check the video task");
      const task = body["task"] as
        | { status?: string; content?: { url?: unknown }; error?: { message?: string } | string }
        | undefined;
      const status = typeof task?.status === "string" ? task.status : "unknown";
      const url = typeof task?.content?.url === "string" ? task.content.url : undefined;
      const err =
        typeof task?.error === "string"
          ? task.error
          : task?.error && typeof task.error === "object"
            ? task.error.message
            : undefined;
      return url !== undefined
        ? { status, url, ...(err !== undefined ? { error: err } : {}) }
        : { status, ...(err !== undefined ? { error: err } : {}) };
    },
  );
