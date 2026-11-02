import { describe, expect, it } from "vitest";
import {
  base64ToFile,
  enhanceImagePrompt,
  enhanceVideoPrompt,
  generatedName,
  imageRequestSchema,
  pollVideoTask,
  VIDEO_STYLES,
  videoRequestSchema,
  videoStyleBlock,
  voiceRequestSchema,
  type VideoTaskStatus,
} from "@/lib/editor/ai-generate";

describe("AI prompt enrichment", () => {
  it("puts the user description first, verbatim, with the style block after it", () => {
    const user = 'a "red" fox — jumps 3× over the fence';
    const p = enhanceVideoPrompt(`  ${user}  `);
    expect(p.startsWith(user)).toBe(true);
    // no meta-instruction wrapper: models read the whole string as scene content
    expect(p).not.toMatch(/Create EXACTLY|Description:/i);
    expect(p).toMatch(/hyper-realistic/i); // default Realistic style follows the description
  });

  it("gives every style its own real rendering block, prompt still verbatim", () => {
    const blocks = VIDEO_STYLES.map((s) => videoStyleBlock(s));
    expect(new Set(blocks).size).toBe(VIDEO_STYLES.length); // no aliased "styles" that render the same
    for (const s of VIDEO_STYLES) {
      expect(enhanceVideoPrompt("a cat on a windowsill", s)).toContain("a cat on a windowsill");
    }
    expect(enhanceVideoPrompt("x", "Realistic")).toMatch(/hyper-realistic/i);
    expect(enhanceVideoPrompt("x", "Realistic")).toMatch(/no cartoon/i);
    expect(enhanceVideoPrompt("x", "Cinematic")).toMatch(/anamorphic|film grain/i);
    expect(enhanceVideoPrompt("x", "Cartoon")).toMatch(/2D cartoon|cel-animation/i);
    expect(enhanceVideoPrompt("x", "Pixar 3D")).toMatch(/Pixar|3D animated/i);
    expect(enhanceVideoPrompt("x", "Paper Art")).toMatch(/paper-craft|paper/i);
  });

  it("adds the lip-sync directive only when a voice reference speaks", () => {
    const silent = enhanceVideoPrompt("a man talks", "Realistic", false);
    const spoken = enhanceVideoPrompt("a man talks", "Realistic", true);
    expect(silent).not.toMatch(/lip movement/i);
    expect(spoken).toMatch(/lip movement.*perfect sync/i);
    expect(spoken).toMatch(/voice timbre follows reference audio/i);
  });

  it("keeps a referenced subject recognisable in stills", () => {
    const img = enhanceImagePrompt("a cat on a windowsill");
    expect(img.startsWith("a cat on a windowsill")).toBe(true);
    expect(img).toMatch(/photorealistic/i);
    expect(img).not.toMatch(/reference image/i);
    expect(enhanceImagePrompt("a cat on a windowsill", true)).toMatch(
      /faithfully recognisable.*reference image/i,
    );
  });

  it("does not force photorealism over a style the user asked for", () => {
    expect(enhanceImagePrompt("a cartoon cat chasing a butterfly")).not.toMatch(/photorealistic/i);
    expect(enhanceImagePrompt("watercolor harbor at dawn")).not.toMatch(/photorealistic/i);
  });
});

describe("generated names", () => {
  it("slugifies the prompt and keeps it extension-safe", () => {
    expect(generatedName("ai-video-", "A Drone!! Shot, City 2K", "mp4")).toBe(
      "ai-video-a-drone-shot-city-2k.mp4",
    );
    const empty = generatedName("ai-voice-", "", "mp3");
    expect(empty).toBe("ai-voice.mp3");
  });
});

describe("base64ToFile", () => {
  it("round-trips bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    const file = base64ToFile(btoa(bin), "video/mp4", "v.mp4");
    expect(file.type).toBe("video/mp4");
    expect(file.size).toBe(bytes.length);
  });
});

describe("pollVideoTask", () => {
  const ctrl = () => new AbortController();
  it("returns the url once the task succeeds, reporting intermediate states", async () => {
    const seen: string[] = [];
    const steps: VideoTaskStatus[] = [
      { status: "queued" },
      { status: "processing" },
      { status: "succeeded", url: "https://cdn/x.mp4" },
    ];
    let n = 0;
    const url = await pollVideoTask(async () => steps[n++]!, "t1", {
      onStatus: (s) => seen.push(s.status),
      signal: ctrl().signal,
      intervalMs: 1,
    });
    expect(url).toBe("https://cdn/x.mp4");
    expect(seen).toEqual(["queued", "processing", "succeeded"]);
  });

  it("rejects on a terminal failure with the provider message", async () => {
    await expect(
      pollVideoTask(async () => ({ status: "failed", error: "safety rejection" }), "t2", {
        onStatus: () => {},
        signal: ctrl().signal,
        intervalMs: 1,
      }),
    ).rejects.toThrow(/failed: safety rejection/);
  });

  it("rejects when the deadline passes while still queued", async () => {
    await expect(
      pollVideoTask(async () => ({ status: "processing" }), "t3", {
        onStatus: () => {},
        signal: ctrl().signal,
        intervalMs: 5,
        timeoutMs: 0,
      }),
    ).rejects.toThrow(/timed out/);
  });
});

describe("request schema boundaries", () => {
  const base = {
    prompt: "a real prompt",
    style: "Realistic",
    duration: 5,
    resolution: "768P",
  } as const;
  it("accepts 4-15 integer seconds and rejects everything else", () => {
    expect(videoRequestSchema.safeParse({ ...base, duration: 4 }).success).toBe(true);
    expect(videoRequestSchema.safeParse({ ...base, duration: 15 }).success).toBe(true);
    expect(videoRequestSchema.safeParse({ ...base, duration: 3 }).success).toBe(false);
    expect(videoRequestSchema.safeParse({ ...base, duration: 16 }).success).toBe(false);
    expect(videoRequestSchema.safeParse({ ...base, duration: 5.5 }).success).toBe(false);
  });

  it("enforces the ratio enum for text-to-video and url shape for frames", () => {
    expect(videoRequestSchema.safeParse({ ...base, ratio: "16:9" }).success).toBe(true);
    expect(videoRequestSchema.safeParse({ ...base, ratio: "21:9" }).success).toBe(false);
    expect(videoRequestSchema.safeParse({ ...base, firstFrameUrl: "not-a-url" }).success).toBe(
      false,
    );
    expect(
      videoRequestSchema.safeParse({ ...base, firstFrameUrl: "https://a.co/b.jpg" }).success,
    ).toBe(true);
    expect(videoRequestSchema.safeParse({ ...base, style: "Anime" }).success).toBe(false);
  });

  it("keeps scene-frame and reference inputs on separate paths", () => {
    const frame = { firstFrameUrl: "https://a.co/b.jpg" };
    const ref = { refAudioUrl: "https://a.co/v.mp3" };
    expect(videoRequestSchema.safeParse({ ...base, ...ref }).success).toBe(true);
    expect(videoRequestSchema.safeParse({ ...base, ...frame, ...ref }).success).toBe(false);
    expect(
      videoRequestSchema.safeParse({
        ...base,
        lastFrameUrl: "https://a.co/z.jpg",
      }).success,
    ).toBe(false); // a last frame alone has nothing to start from
  });

  it("validates image and voice inputs", () => {
    expect(imageRequestSchema.safeParse({ prompt: "ab", aspectRatio: "1:1" }).success).toBe(false); // prompt below 3 chars
    expect(
      imageRequestSchema.safeParse({ prompt: "x".repeat(1001), aspectRatio: "1:1" }).success,
    ).toBe(false); // provider caps the enriched prompt at 1500 chars
    expect(
      imageRequestSchema.safeParse({ prompt: "fine prompt", aspectRatio: "5:4" }).success,
    ).toBe(
      false, // ratio outside the enum
    );
    expect(
      imageRequestSchema.safeParse({
        prompt: "fine prompt",
        aspectRatio: "1:1",
        referenceImageUrl: "not-a-url",
      }).success,
    ).toBe(false);
    expect(
      imageRequestSchema.safeParse({
        prompt: "fine prompt",
        aspectRatio: "1:1",
        referenceImageUrl: "https://a.co/ref.jpg",
      }).success,
    ).toBe(true);
    expect(voiceRequestSchema.safeParse({ text: "", voiceId: "v" }).success).toBe(false);
    expect(voiceRequestSchema.safeParse({ text: "hi", voiceId: "v" }).success).toBe(true);
  });
});
