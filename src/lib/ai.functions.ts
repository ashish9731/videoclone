import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseTranslationResponse, translationPrompt } from "@/lib/editor/ai-suggest";
import { openrouterChat } from "@/lib/ai-assist.functions";

const inputSchema = z.object({
  target: z.string().min(2).max(40),
  cues: z.array(z.object({ id: z.string(), text: z.string().max(2000) })).min(1).max(120),
});

/** Subtitle translation for the Captions panel, on the same OpenRouter model as AI Assist. */
export const translateCues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const cues = data.cues.map((c) => ({ id: c.id, text: c.text }));
    const text = await openrouterChat(translationPrompt(data.target, cues), context.userId, 4000);
    return parseTranslationResponse(text, cues.map((c) => c.id));
  });
