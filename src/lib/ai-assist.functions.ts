import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assistPrompt,
  assistRequestSchema,
  parseAssistResponse,
  parsePromptWrite,
  promptWriterPrompt,
  promptWriterSchema,
  type AssistResult,
} from "@/lib/editor/ai-suggest";

/**
 * AI Assist over OpenRouter (chat completions): titles, descriptions, tags, caption text and
 * subtitle translation. The key lives only in the server env; every call needs a verified
 * Supabase session and shares a per-user throttle because the model account is billed per key.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function openrouterKey(): string {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) throw new Error("AI assist is not configured");
  return key;
}

/** Free-tier Nemotron by default; override with AI_SUGGEST_MODEL to move to a paid model. */
export function assistModel(): string {
  return process.env["AI_SUGGEST_MODEL"] ?? "nvidia/nemotron-3-ultra-550b-a55b:free";
}

const TEXT_CALLS_PER_MIN = 12;
const recentCalls = new Map<string, number[]>();
function throttle(userId: string) {
  const now = Date.now();
  const hits = (recentCalls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= TEXT_CALLS_PER_MIN)
    throw new Error("Too many AI requests. Please wait a minute.");
  hits.push(now);
  recentCalls.set(userId, hits);
  if (recentCalls.size > 500) recentCalls.clear();
}

/** One chat turn with Nemotron; returns the assistant text or throws with the provider's reason. */
export async function openrouterChat(
  prompt: string,
  userId: string,
  maxTokens = 2000,
): Promise<string> {
  throttle(userId);
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: assistModel(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = body?.["error"];
    const detail =
      err && typeof err === "object"
        ? String((err as Record<string, unknown>)["message"] ?? `HTTP ${res.status}`)
        : typeof body?.["message"] === "string"
          ? body["message"]
          : `HTTP ${res.status}`;
    throw new Error(`AI assist failed: ${detail}`);
  }
  const choices = Array.isArray(body?.["choices"])
    ? (body["choices"] as Record<string, unknown>[])
    : [];
  const message = choices[0]?.["message"] as { content?: unknown } | undefined;
  const text = typeof message?.content === "string" ? message.content.trim() : "";
  if (!text) throw new Error("AI assist returned nothing. Please try again.");
  return text;
}

export const aiAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assistRequestSchema.parse(input))
  .handler(async ({ data, context }): Promise<AssistResult> => {
    const text = await openrouterChat(assistPrompt(data.kind, data.input), context.userId);
    return parseAssistResponse(text, data.kind);
  });

/** AI Studio prompt writer: enhance a draft or expand a plain idea into a generation prompt. */
export const writeGenerationPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => promptWriterSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ prompt: string }> => {
    const text = await openrouterChat(promptWriterPrompt(data), context.userId, 1200);
    return { prompt: parsePromptWrite(text) };
  });
