import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Copy,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Mic,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type EditorStore } from "@/lib/editor/store";
import {
  type CaptionTrack,
  type MediaAsset,
  clipFromAsset,
  defaultCaptionStyle,
  timelineDuration,
  uid,
} from "@/lib/editor/types";
import { addClipToTimeline } from "@/lib/editor/placement";
import { remoteUrl, uploadMedia } from "@/lib/editor/media";
import {
  base64ToFile,
  fetchUrlToFile,
  generatedName,
  pollVideoTask,
  VIDEO_STYLES,
  type VideoStyle,
  type VideoTaskStatus,
} from "@/lib/editor/ai-generate";
import {
  chunkCaptionLines,
  clampPrompt,
  distributeCues,
  type AssistKind,
  type AssistResult,
} from "@/lib/editor/ai-suggest";
import { aiAssist, writeGenerationPrompt } from "@/lib/ai-assist.functions";
import {
  createVideoTask,
  generateImage,
  generateVoice,
  listAiVoices,
  queryVideoTask,
  type AiVoice,
} from "@/lib/ai-generate.functions";

interface Props {
  store: EditorStore;
  assets: MediaAsset[];
  userId: string;
  projectId: string;
  onAdded: (a: MediaAsset) => void;
  createCaptionTrack: (t: Omit<CaptionTrack, "id" | "project_id">) => Promise<CaptionTrack | null>;
}

type Section = "Voice" | "Image" | "Video" | "Assist";

const inputCls = "w-full rounded border bg-background p-2 text-xs";
const labelCls = "text-[11px] font-medium text-muted-foreground";

/**
 * AI Studio: ElevenLabs voice-over, MiniMax image stills, MiniMax-H3 video and the
 * OpenRouter (Nemotron) writing assist. Nothing special happens after generation: the bytes
 * become a File and ride the exact same uploadMedia pipeline as user uploads, so the result
 * lands in the private media bucket under the owner's prefix, shows up in the Media library
 * and can be dropped on the timeline.
 */
export function AIStudioPanel({
  store,
  assets,
  userId,
  projectId,
  onAdded,
  createCaptionTrack,
}: Props) {
  const [section, setSection] = useState<Section>("Voice");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // ── shared finish: File -> media bucket -> library + timeline ──
  const publish = async (file: File) => {
    const asset = await uploadMedia(file, userId, projectId, (p) => setProgress(p));
    onAdded(asset);
    addClipToTimeline(store, clipFromAsset(asset, store.get().time));
    toast.success(`Added "${asset.name}" to the timeline`);
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setProgress(0);
    setStatus(label);
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof Error && e.message === "Cancelled"))
        toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
      setProgress(0);
      setStatus("");
    }
  };

  // ── Voice ──
  const [voices, setVoices] = useState<AiVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voiceText, setVoiceText] = useState("");
  useEffect(() => {
    if (voices.length) return;
    void listAiVoices()
      .then((vs) => {
        setVoices(vs);
        if (vs[0]) setVoiceId(vs[0].id);
      })
      .catch(() => {
        /* no voices configured: the section shows its own hint */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const makeVoice = () =>
    run("Generating voice…", async () => {
      const { audioBase64, mime } = await generateVoice({ data: { text: voiceText, voiceId } });
      await publish(base64ToFile(audioBase64, mime, generatedName("ai-voice-", voiceText, "mp3")));
    });

  // ── Image ──
  const [imagePrompt, setImagePrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [imageRefId, setImageRefId] = useState("");
  const refFileRef = useRef<HTMLInputElement | null>(null);
  const makeImage = () =>
    run("Generating image…", async () => {
      const ref = imageAssets.find((a) => a.id === imageRefId);
      const referenceImageUrl = ref ? await remoteUrl(ref.storage_path) : undefined;
      const { imagesBase64 } = await generateImage({
        data: {
          prompt: imagePrompt,
          aspectRatio: aspect as "1:1",
          ...(referenceImageUrl !== undefined ? { referenceImageUrl } : {}),
        },
      });
      setProgress(0.1);
      await publish(
        base64ToFile(
          imagesBase64[0] as string,
          "image/jpeg",
          generatedName("ai-image-", imagePrompt, "jpg"),
        ),
      );
    });
  // a reference can also come straight from disk: it joins the library like any upload and
  // becomes selectable everywhere (image reference, scene frame, character look)
  const uploadReference = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    void run("Uploading reference…", async () => {
      const asset = await uploadMedia(file, userId, projectId, (p) => setProgress(p));
      onAdded(asset);
      setImageRefId(asset.id);
      toast.success(`"${asset.name}" is now the reference`);
    });
  };

  // ── Video ──
  const [videoPrompt, setVideoPrompt] = useState("");
  const [style, setStyle] = useState<VideoStyle>("Realistic");
  // H3 runs scene frames and character/voice references on separate paths, so the studio
  // exposes them as explicit modes instead of mixing inputs the provider would reject
  const [mode, setMode] = useState<"text" | "scene" | "character">("text");
  const [frameAssetId, setFrameAssetId] = useState("");
  const [charImageId, setCharImageId] = useState("");
  const [voiceAssetId, setVoiceAssetId] = useState("");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<"768P" | "2K">("768P");
  const [ratio, setRatio] = useState("16:9");
  const imageAssets = assets.filter((a) => a.kind === "image");
  // provider limit for a voice reference: 2–15 s per clip
  const voiceCandidates = assets.filter(
    (a) => a.kind === "audio" && a.duration >= 2 && a.duration <= 15,
  );
  const pickVoice = (id: string) => {
    setVoiceAssetId(id);
    const a = voiceCandidates.find((x) => x.id === id);
    // give the speech room to play out: clip length follows the voice, clamped to 4–15 s
    if (a) setDuration(Math.max(4, Math.min(15, Math.ceil(a.duration) || 5)));
  };
  const onVideoStatus = (s: VideoTaskStatus) =>
    setStatus(
      s.status === "succeeded"
        ? "Downloading video…"
        : s.status === "queued" || s.status === "unknown"
          ? "Queued at MiniMax…"
          : `Video ${s.status}…`,
    );
  const makeVideo = () =>
    run("Generating video…", async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      const frame = mode === "scene" ? imageAssets.find((a) => a.id === frameAssetId) : undefined;
      if (mode === "scene" && !frame) throw new Error("Pick a scene image from the library first");
      const charImg =
        mode === "character" ? imageAssets.find((a) => a.id === charImageId) : undefined;
      const voice =
        mode === "character" ? voiceCandidates.find((a) => a.id === voiceAssetId) : undefined;
      if (mode === "character" && !charImg && !voice)
        throw new Error("Pick a character image and/or a voice clip to sync");
      const firstFrameUrl = frame ? await remoteUrl(frame.storage_path) : undefined;
      const refImageUrl = charImg ? await remoteUrl(charImg.storage_path) : undefined;
      const refAudioUrl = voice ? await remoteUrl(voice.storage_path) : undefined;
      const { taskId } = await createVideoTask({
        data: {
          prompt: videoPrompt,
          style,
          duration,
          resolution,
          ...(firstFrameUrl !== undefined ? { firstFrameUrl } : {}),
          ...(refImageUrl !== undefined ? { refImageUrl } : {}),
          ...(refAudioUrl !== undefined ? { refAudioUrl } : {}),
          ...(mode === "text" ? { ratio: ratio as "16:9" } : {}),
        },
      });
      const url = await pollVideoTask((id) => queryVideoTask({ data: { taskId: id } }), taskId, {
        onStatus: onVideoStatus,
        signal: controller.signal,
      });
      setProgress(0.1);
      await publish(
        await fetchUrlToFile(url, "video/mp4", generatedName("ai-video-", videoPrompt, "mp4")),
      );
    });

  // ── prompt writer: AI Enhance polishes a draft, "From idea" expands plain language ──
  const improvePrompt = (which: "image" | "video", mode: "enhance" | "write") => {
    const src = which === "image" ? imagePrompt : videoPrompt;
    void run(mode === "enhance" ? "Enhancing prompt…" : "Writing prompt from idea…", async () => {
      const { prompt } = await writeGenerationPrompt({
        data: {
          target: which,
          mode,
          idea: src,
          ...(which === "video" ? { style } : {}),
        },
      });
      const clamped = clampPrompt(prompt, which === "image" ? 1000 : 2000);
      if (which === "image") setImagePrompt(clamped);
      else setVideoPrompt(clamped);
      toast.success(mode === "enhance" ? "Prompt enhanced" : "Prompt written from your idea");
    });
  };

  // ── Assist (OpenRouter Nemotron): titles, description, tags, caption text ──
  const [assistText, setAssistText] = useState("");
  const [assistKind, setAssistKind] = useState<AssistKind | "">("");
  const [assistResult, setAssistResult] = useState<AssistResult | null>(null);
  const [assistError, setAssistError] = useState("");
  const assist = (kind: AssistKind) => {
    // each kind is one real request; results replace cleanly instead of stacking stale answers
    setAssistError("");
    void run(`Assistant: ${kind}…`, async () => {
      setAssistKind(kind);
      try {
        setAssistResult(await aiAssist({ data: { kind, input: assistText } }));
      } catch (e) {
        setAssistKind("");
        setAssistError(e instanceof Error ? e.message : "The assistant is unavailable");
      }
    });
  };
  const copyText = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Copy failed — select the text manually"));
  };
  const addAssistCaptions = () => {
    const lines = chunkCaptionLines(assistResult?.lines ?? []);
    if (!lines.length) return;
    void run("Adding captions…", async () => {
      // cues pace over the current timeline (or a floor of one second per line when it is empty)
      const span = Math.max(timelineDuration(store.get().timeline), lines.length);
      const cues = distributeCues(
        lines.map((text) => ({ text, chars: text.length })),
        span,
      ).map((c) => ({ id: uid(), ...c }));
      const t = await createCaptionTrack({
        name: "AI captions",
        language: "auto",
        cues,
        style: defaultCaptionStyle(),
        visible: true,
      });
      if (!t) throw new Error("Could not save the caption track");
      toast.success(`Added ${cues.length} caption lines to the timeline`);
    });
  };

  const sectionBtn = (s: Section, I: typeof Mic) => (
    <button
      key={s}
      aria-pressed={section === s}
      onClick={() => setSection(s)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
        section === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
      }`}
    >
      <I className="size-3.5" /> {s}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex gap-1">
        {sectionBtn("Voice", Mic)}
        {sectionBtn("Image", ImageIcon)}
        {sectionBtn("Video", Clapperboard)}
        {sectionBtn("Assist", Lightbulb)}
      </div>

      {busy && (
        <div className="flex items-center gap-2 rounded bg-secondary px-2 py-1.5 text-[11px]">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span className="min-w-0 flex-1 truncate">{status}</span>
          {progress > 0 && <span className="font-mono">{Math.round(progress * 100)}%</span>}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {section === "Voice" && (
          <>
            <p className="text-[11px] text-muted-foreground">
              Hyper-natural AI voice-over (ElevenLabs multilingual). Added as an audio clip.
            </p>
            <label className={labelCls} htmlFor="ai-voice-text">
              Script
            </label>
            <textarea
              id="ai-voice-text"
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="What should the voice say?"
              className={inputCls}
            />
            <label className={labelCls} htmlFor="ai-voice-pick">
              Voice
            </label>
            {voices.length ? (
              <select
                id="ai-voice-pick"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className={inputCls}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.labels ? ` — ${v.labels}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded bg-secondary p-2 text-[11px] text-muted-foreground">
                No voices loaded — set ELEVENLABS_API_KEY on the server, then reload.
              </p>
            )}
            <Button
              size="sm"
              className="w-full"
              disabled={busy || !voiceText.trim() || !voiceId}
              onClick={() => void makeVoice()}
            >
              <WandSparkles className="mr-2 size-4" /> Generate voice
            </Button>
          </>
        )}

        {section === "Image" && (
          <>
            <p className="text-[11px] text-muted-foreground">
              Photoreal stills from a prompt (MiniMax). Optionally anchor a reference image so the
              subject carries over. Added as an image clip.
            </p>
            <label className={labelCls} htmlFor="ai-image-prompt">
              Prompt
            </label>
            <textarea
              id="ai-image-prompt"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={6}
              maxLength={1000}
              placeholder="Describe the exact scene, subject and lighting…"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || imagePrompt.trim().length < 3}
                onClick={() => improvePrompt("image", "enhance")}
              >
                <WandSparkles className="mr-1.5 size-3.5" /> AI Enhance
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || imagePrompt.trim().length < 3}
                onClick={() => improvePrompt("image", "write")}
              >
                <Lightbulb className="mr-1.5 size-3.5" /> From my idea
              </Button>
            </div>
            <label className={labelCls} htmlFor="ai-image-ref">
              Reference image (optional)
            </label>
            <div className="flex gap-2">
              <select
                id="ai-image-ref"
                value={imageRefId}
                onChange={(e) => setImageRefId(e.target.value)}
                className={inputCls}
              >
                <option value="">None</option>
                {imageAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                disabled={busy}
                onClick={() => refFileRef.current?.click()}
              >
                <ImageIcon className="mr-1 size-3.5" /> Upload
              </Button>
            </div>
            <input
              ref={refFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Upload reference image"
              onChange={(e) => {
                uploadReference(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <label className={labelCls} htmlFor="ai-image-aspect">
              Aspect ratio
            </label>
            <select
              id="ai-image-aspect"
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className={inputCls}
            >
              {["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="w-full"
              disabled={busy || imagePrompt.trim().length < 3}
              onClick={() => void makeImage()}
            >
              <WandSparkles className="mr-2 size-4" /> Generate image
            </Button>
          </>
        )}

        {section === "Video" && (
          <>
            <p className="text-[11px] text-muted-foreground">
              MiniMax H3 follows your prompt exactly, in the style you pick. "Character + voice"
              lip-syncs spoken dialogue to a voice clip. 4–15 s clips.
            </p>
            <label className={labelCls} htmlFor="ai-video-prompt">
              Prompt
            </label>
            <textarea
              id="ai-video-prompt"
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Describe the shot: subject, action, camera, environment… For dialogue, write what the character says."
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || videoPrompt.trim().length < 3}
                onClick={() => improvePrompt("video", "enhance")}
              >
                <WandSparkles className="mr-1.5 size-3.5" /> AI Enhance
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || videoPrompt.trim().length < 3}
                onClick={() => improvePrompt("video", "write")}
              >
                <Lightbulb className="mr-1.5 size-3.5" /> From my idea
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} htmlFor="ai-video-mode">
                  Generation mode
                </label>
                <select
                  id="ai-video-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "text" | "scene" | "character")}
                  className={inputCls}
                >
                  <option value="text">Text to video</option>
                  <option value="scene">Animate a scene image</option>
                  <option value="character">Character + voice (lip-sync)</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ai-video-style">
                  Style
                </label>
                <select
                  id="ai-video-style"
                  value={style}
                  onChange={(e) => setStyle(e.target.value as VideoStyle)}
                  className={inputCls}
                >
                  {VIDEO_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {mode === "scene" && (
              <>
                <label className={labelCls} htmlFor="ai-video-frame">
                  Scene image (first frame)
                </label>
                <select
                  id="ai-video-frame"
                  value={frameAssetId}
                  onChange={(e) => setFrameAssetId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Choose an image…</option>
                  {imageAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {mode === "character" && (
              <>
                <label className={labelCls} htmlFor="ai-video-char">
                  Character image (look reference)
                </label>
                <select
                  id="ai-video-char"
                  value={charImageId}
                  onChange={(e) => setCharImageId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">None — invent the character</option>
                  {imageAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <label className={labelCls} htmlFor="ai-video-voice">
                  Voice clip (dialogue audio, 2–15 s)
                </label>
                <select
                  id="ai-video-voice"
                  value={voiceAssetId}
                  onChange={(e) => pickVoice(e.target.value)}
                  className={inputCls}
                >
                  <option value="">None — no spoken dialogue</option>
                  {voiceCandidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({Math.round(a.duration)} s)
                    </option>
                  ))}
                </select>
                {voiceCandidates.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    No eligible audio yet — generate an AI voice or import a clip between 2 and 15
                    seconds.
                  </p>
                )}
              </>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls} htmlFor="ai-video-duration">
                  Seconds
                </label>
                <input
                  id="ai-video-duration"
                  type="number"
                  min={4}
                  max={15}
                  step={1}
                  value={duration}
                  onChange={(e) =>
                    setDuration(Math.max(4, Math.min(15, Math.round(Number(e.target.value) || 5))))
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="ai-video-res">
                  Quality
                </label>
                <select
                  id="ai-video-res"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as "768P" | "2K")}
                  className={inputCls}
                >
                  <option value="768P">768P</option>
                  <option value="2K">2K</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ai-video-ratio">
                  Ratio
                </label>
                <select
                  id="ai-video-ratio"
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                  disabled={mode !== "text"}
                  className={`${inputCls} disabled:opacity-50`}
                >
                  {["16:9", "9:16", "1:1", "4:3", "3:4"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={busy || videoPrompt.trim().length < 3}
              onClick={() => void makeVideo()}
            >
              <WandSparkles className="mr-2 size-4" />
              {busy ? "Working…" : "Generate video"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Video generation runs in the cloud and can take a few minutes; keep this tab open
              while the status updates.
            </p>
          </>
        )}

        {section === "Assist" && (
          <>
            <p className="text-[11px] text-muted-foreground">
              Writing assistant (Nemotron via OpenRouter): title, description and tag ideas, plus
              caption lines from your script.
            </p>
            <label className={labelCls} htmlFor="ai-assist-input">
              What is the video about? (or paste the script)
            </label>
            <textarea
              id="ai-assist-input"
              value={assistText}
              onChange={(e) => setAssistText(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="A 60-second travel vlog through Kyoto in the rain…"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["title", "Title ideas"],
                  ["description", "Description"],
                  ["tags", "Tag suggestions"],
                  ["captions", "Caption lines"],
                ] as [AssistKind, string][]
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="secondary"
                  disabled={busy || assistText.trim().length < 3}
                  onClick={() => assist(kind)}
                >
                  {assistKind === kind && busy ? (
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                  ) : (
                    <Lightbulb className="mr-1 size-3.5" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
            {assistError && <p className="text-[11px] text-destructive">{assistError}</p>}
            {assistResult?.titles && (
              <div className="space-y-1">
                {assistResult.titles.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => copyText(t)}
                    title="Copy title"
                    className="flex w-full items-start gap-1.5 rounded bg-secondary p-1.5 text-left text-[11px] hover:bg-accent"
                  >
                    <Copy className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">{t}</span>
                  </button>
                ))}
              </div>
            )}
            {assistResult?.description && (
              <div className="space-y-1">
                <p className="whitespace-pre-wrap rounded bg-secondary p-2 text-[11px]">
                  {assistResult.description}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyText(assistResult.description ?? "")}
                >
                  <Copy className="mr-1 size-3.5" /> Copy description
                </Button>
              </div>
            )}
            {assistResult?.tags && (
              <>
                <div className="flex flex-wrap gap-1">
                  {assistResult.tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => copyText(t)}
                      title="Copy tag"
                      className="rounded bg-secondary px-1.5 py-0.5 text-[10px] hover:bg-accent"
                    >
                      #{t}
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyText(assistResult.tags?.join(", ") ?? "")}
                >
                  <Copy className="mr-1 size-3.5" /> Copy all tags
                </Button>
              </>
            )}
            {assistResult?.lines && (
              <div className="space-y-1">
                <div className="max-h-40 overflow-y-auto rounded bg-secondary p-2 text-[11px]">
                  {assistResult.lines.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => copyText(assistResult.lines?.join("\n") ?? "")}
                  >
                    <Copy className="mr-1 size-3.5" /> Copy text
                  </Button>
                  <Button size="sm" disabled={busy} onClick={addAssistCaptions}>
                    <WandSparkles className="mr-1 size-3.5" /> To captions
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
