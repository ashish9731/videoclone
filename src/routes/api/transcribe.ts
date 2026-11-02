import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 20 * 1024 * 1024;

async function verifyUser(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });

/**
 * Auto-caption transcription on ElevenLabs Scribe — the same ELEVENLABS_API_KEY that powers
 * the Voices section, so captions need no second provider. No language is sent unless the
 * caller insists: the model auto-detects, and captions come out in the spoken language.
 */
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await verifyUser(request);
        if (!userId) return json({ error: "Please sign in again" }, 401);
        const apiKey = process.env["ELEVENLABS_API_KEY"];
        if (!apiKey) return json({ error: "Transcription is not configured" }, 500);

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
          return json({ error: "Invalid audio chunk" }, 400);
        }

        const up = new FormData();
        up.append("model_id", "scribe_v1");
        up.append("file", new File([file], "chunk.wav", { type: "audio/wav" }));
        const language = form.get("language");
        if (typeof language === "string" && language.trim())
          up.append("language_code", language.trim());

        const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: up,
          signal: request.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let message = `Transcription failed (${res.status})`;
          try {
            const j = JSON.parse(text) as { detail?: unknown };
            const d = j.detail;
            message =
              (typeof d === "string"
                ? d
                : d && typeof d === "object"
                  ? (d as { message?: string }).message
                  : undefined) ?? message;
          } catch {
            /* keep default */
          }
          const extra: Record<string, string> = {};
          const ra = res.headers.get("retry-after");
          if (ra) extra["retry-after"] = ra;
          return json({ error: message }, res.status, extra);
        }

        const out = (await res.json()) as { text?: unknown; language_code?: unknown };
        const transcript = typeof out.text === "string" ? out.text : "";
        const detected = typeof out.language_code === "string" ? out.language_code : "";
        return json({ text: transcript.trim(), language: detected });
      },
    },
  },
});
