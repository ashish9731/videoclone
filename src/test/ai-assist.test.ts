import { describe, expect, it } from "vitest";
import {
  ASSIST_KINDS,
  assistRequestSchema,
  assistPrompt,
  chunkCaptionLines,
  clampPrompt,
  distributeCues,
  parseAssistResponse,
  parsePromptWrite,
  parseTranslationResponse,
  PROMPT_MODES,
  PROMPT_TARGETS,
  promptWriterPrompt,
  promptWriterSchema,
  translationPrompt,
} from "@/lib/editor/ai-suggest";

describe("assist prompts", () => {
  it("embeds the user's text verbatim and demands one strict JSON shape per kind", () => {
    const input = 'My "Kyoto" vlog — 60s in the rain';
    for (const kind of ASSIST_KINDS) {
      const p = assistPrompt(kind, input);
      expect(p, kind).toContain(`"""${input}"""`);
      expect(p, kind).toMatch(/ONLY one JSON object/i);
    }
    expect(assistPrompt("title", "x").toLowerCase()).toContain("titles");
    expect(assistPrompt("tags", "x").toLowerCase()).toContain("tags");
    expect(assistPrompt("description", "x").toLowerCase()).toContain("description");
    expect(assistPrompt("captions", "x").toLowerCase()).toContain("lines");
  });
});

describe("assist response parsing", () => {
  it("reads plain JSON and survives fences or surrounding prose", () => {
    expect(parseAssistResponse('{"titles":["A","B"]}', "title").titles).toEqual(["A", "B"]);
    expect(parseAssistResponse('```json\n{"tags":["a","b"]}\n```', "tags").tags).toEqual([
      "a",
      "b",
    ]);
    expect(
      parseAssistResponse('Sure! Here you go: {"description":"Hi."}', "description").description,
    ).toBe("Hi.");
  });

  it("normalizes tags and drops duplicates", () => {
    const r = parseAssistResponse('{"tags":["#Kyoto Trip","kyoto trip","","travel"]}', "tags");
    expect(r.tags).toEqual(["kyoto-trip", "travel"]);
  });

  it("caps list lengths instead of trusting the model", () => {
    const many = JSON.stringify({ titles: Array.from({ length: 9 }, (_, i) => `t${i}`) });
    expect(parseAssistResponse(many, "title").titles?.length).toBe(5);
  });

  it("rejects unreadable or empty answers with a user-facing reason", () => {
    expect(() => parseAssistResponse("no json here", "title")).toThrow(/unreadable/i);
    expect(() => parseAssistResponse('{"titles":[]}', "title")).toThrow(/no titles/i);
    expect(() => parseAssistResponse('{"description":"  "}', "description")).toThrow(
      /no description/i,
    );
  });
});

describe("caption chunking and cue pacing", () => {
  it("splits over-long lines at word boundaries, hard-cutting only long words", () => {
    const chunks = chunkCaptionLines([
      "this line is definitely longer than the forty two character reading cap",
      "supercalifragilisticexpialidociousandthen Some short tail",
    ]);
    expect(chunks.every((c) => c.length <= 42)).toBe(true);
    expect(chunks.some((c) => c === "supercalifragilisticexpialidociousandthen")).toBe(true);
  });

  it("paces cues proportionally and covers the whole span exactly once", () => {
    const chunks = [
      { text: "aa", chars: 2 },
      { text: "bbcc", chars: 4 },
    ];
    const cues = distributeCues(chunks, 12);
    expect(cues[0]!.start).toBe(0);
    expect(cues[0]!.end).toBeCloseTo(4, 6);
    expect(cues[1]!.start).toBeCloseTo(4, 6);
    expect(cues[1]!.end).toBe(12);
    const bad = distributeCues(chunks, 0); // falls back to 1s per chunk, never zero-length cues
    expect(bad.every((c) => c.end > c.start && Number.isFinite(c.start))).toBe(true);
  });
});

describe("translation prompt and parsing", () => {
  it("keeps every id once and ignores invented or duplicate ones", () => {
    const ids = ["c1", "c2"];
    const out = parseTranslationResponse(
      '{"translations":[{"id":"c1","text":"Bonjour"},{"id":"c1","text":"dup"},{"id":"c9","text":"ghost"},{"id":"c2","text":" Monde "}]}',
      ids,
    );
    expect(out).toEqual([
      { id: "c1", text: "Bonjour" },
      { id: "c2", text: "Monde" },
    ]);
  });

  it("fails loudly when nothing usable comes back", () => {
    expect(() => parseTranslationResponse("not json", ["c1"])).toThrow(/unreadable/i);
    expect(() => parseTranslationResponse('{"translations":[]}', ["c1"])).toThrow(
      /no translations/i,
    );
  });

  it("puts the target language and the cues into the prompt", () => {
    const p = translationPrompt("French", [{ id: "c1", text: "Hello" }]);
    expect(p).toContain("French");
    expect(p).toContain('"text":"Hello"');
  });
});

describe("assist request schema", () => {
  it("accepts the four kinds and bounds the input", () => {
    expect(assistRequestSchema.safeParse({ kind: "title", input: "abc" }).success).toBe(true);
    expect(assistRequestSchema.safeParse({ kind: "hashtags", input: "abc" }).success).toBe(false);
    expect(assistRequestSchema.safeParse({ kind: "tags", input: "ab" }).success).toBe(false);
    expect(assistRequestSchema.safeParse({ kind: "tags", input: "x".repeat(4001) }).success).toBe(
      false,
    );
  });
});

describe("generation-prompt writer", () => {
  it("frames every target/mode pair around the idea with a strict JSON shape", () => {
    const idea = 'my dog "Biscuit" napping on a blue sofa';
    for (const target of PROMPT_TARGETS)
      for (const mode of PROMPT_MODES) {
        const p = promptWriterPrompt({ target, mode, idea });
        expect(p, `${target}/${mode}`).toContain(`"""${idea}"""`);
        expect(p, `${target}/${mode}`).toMatch(/ONLY one JSON object/i);
        expect(p, `${target}/${mode}`).toContain('{"prompt":"..."}');
      }
  });

  it("tailors the brief to the medium, the mode and the chosen style", () => {
    expect(promptWriterPrompt({ target: "video", mode: "write", idea: "a fox runs" })).toMatch(
      /camera movement/i,
    );
    expect(promptWriterPrompt({ target: "image", mode: "write", idea: "a fox runs" })).toMatch(
      /frozen frame/i,
    );
    expect(
      promptWriterPrompt({ target: "video", mode: "enhance", idea: "a fox", style: "Paper Art" }),
    ).toContain("Paper Art");
    expect(promptWriterPrompt({ target: "video", mode: "enhance", idea: "a fox" })).not.toMatch(
      /Render style to write for/,
    );
    expect(
      promptWriterPrompt({ target: "image", mode: "enhance", idea: "a fox" }).toLowerCase(),
    ).toContain("keep every subject");
  });

  it("reads the prompt back, tolerating prose, and refuses junk", () => {
    expect(parsePromptWrite('Here you go: {"prompt":"A fox on a windowsill."}')).toBe(
      "A fox on a windowsill.",
    );
    expect(() => parsePromptWrite("no json at all")).toThrow(/unreadable prompt/i);
    expect(() => parsePromptWrite('{"prompt":"   "}')).toThrow(/returned no prompt/i);
  });

  it("clamps oversized answers at a word boundary", () => {
    expect(clampPrompt("short", 10)).toBe("short");
    const words = "word ".repeat(40).trim();
    const clamped = clampPrompt(words, 30);
    expect(clamped.length).toBeLessThanOrEqual(30);
    expect(clamped.endsWith("word")).toBe(true);
    // an unbroken long word is hard-cut, never dropped whole
    expect(clampPrompt("x".repeat(100), 30)).toBe("x".repeat(30));
  });

  it("bounds writer requests like the other assist calls", () => {
    expect(
      promptWriterSchema.safeParse({ target: "image", mode: "write", idea: "a nice fox" }).success,
    ).toBe(true);
    expect(
      promptWriterSchema.safeParse({ target: "audio", mode: "write", idea: "a fox" }).success,
    ).toBe(false);
    expect(
      promptWriterSchema.safeParse({ target: "video", mode: "write", idea: "ab" }).success,
    ).toBe(false);
    expect(
      promptWriterSchema.safeParse({ target: "video", mode: "rewrite", idea: "a fox" }).success,
    ).toBe(false);
  });
});
