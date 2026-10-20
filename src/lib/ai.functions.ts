import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  target: z.string().min(2).max(40),
  cues: z.array(z.object({ id: z.string(), text: z.string().max(2000) })).min(1).max(120),
});

export const translateCues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("Translation is not configured");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output } = await import("ai");
    const provider = createOpenAI({
      baseURL: process.env["AI_API_BASE_URL"] ?? "https://api.openai.com/v1",
      apiKey,
    });
    const schema = z.object({
      translations: z.array(z.object({ id: z.string(), text: z.string() })),
    });
    const result = streamText({
      model: provider.responses(process.env["AI_MODEL"] ?? "gpt-4o-mini"),
      instructions:
        "You translate video subtitles. Translate each cue's text into the target language. Keep it natural, concise and suitable for on-screen subtitles. Preserve meaning, tone and line breaks. Return every id exactly once.",
      prompt: `Target language: ${data.target}\n\nCues (JSON):\n${JSON.stringify(data.cues)}`,
      output: Output.object({ schema }),
      providerOptions: {
        openai: {
          store: false,
        },
      },
    });
    const out = await result.output;
    return out.translations;
  });
