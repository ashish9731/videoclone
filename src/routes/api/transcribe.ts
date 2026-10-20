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
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await verifyUser(request);
        if (!userId) return json({ error: "Please sign in again" }, 401);
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) return json({ error: "Transcription is not configured" }, 500);

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
          return json({ error: "Invalid audio chunk" }, 400);
        }

        const up = new FormData();
        up.append("model", process.env["AI_TRANSCRIBE_MODEL"] ?? "whisper-1");
        up.append("file", new File([file], "chunk.wav", { type: "audio/wav" }));
        up.append("response_format", "json");
        up.append("stream", "true");

        const base = (process.env["AI_API_BASE_URL"] ?? "https://api.openai.com/v1").replace(/\/+$/, "");
        const res = await fetch(`${base}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: up,
          signal: request.signal,
        });
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          let message = `Transcription failed (${res.status})`;
          try {
            const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
            message = (typeof j.error === "object" ? j.error?.message : j.error) ?? j.message ?? message;
          } catch {
            /* keep default */
          }
          const extra: Record<string, string> = {};
          const ra = res.headers.get("retry-after");
          if (ra) extra["retry-after"] = ra;
          return json({ error: message }, res.status, extra);
        }

        // Parse SSE stream
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let deltas = "";
        let final: string | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const ev = JSON.parse(data) as { type?: string; delta?: string; text?: string; error?: { message?: string } };
              if (ev.type === "transcript.text.delta" && ev.delta) deltas += ev.delta;
              else if (ev.type === "transcript.text.done" && typeof ev.text === "string") final = ev.text;
              else if (ev.error) return json({ error: ev.error.message ?? "Transcription failed" }, 502);
            } catch {
              /* ignore malformed line */
            }
          }
        }
        return json({ text: final ?? deltas });
      },
    },
  },
});
