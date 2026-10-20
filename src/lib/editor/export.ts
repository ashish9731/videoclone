import { Reframer, cropRect } from "./reframe";
import {
  ALL_FORMATS,
  AudioBufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  UrlSource,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { mixTimelineAudio } from "./audio-mix";
import { remoteUrl } from "./media";
import { renderFrame } from "./render";
import { outgoingTail } from "./transitions";
import { AI_EFFECTS, ensureSegmenter } from "./ai";
import {
  type CaptionTrack,
  type Clip,
  type MediaAsset,
  type Timeline,
  clipEnd,
  sourceTime,
  timelineDuration,
} from "./types";

export interface ExportOptions {
  timeline: Timeline;
  captions: CaptionTrack[];
  assets: Map<string, MediaAsset>;
  width: number;
  height: number;
  baseHeight: number;
  sourceAspect?: number | undefined;
  autoReframe?: boolean | undefined;
  fps: number;
  onProgress: (p: number, label: string) => void;
  signal: AbortSignal;
}

interface ClipFrames {
  input: Input;
  gen: AsyncGenerator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null, void, unknown>;
  current: CanvasImageSource | null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not load image"));
    img.src = url;
  });
}

export async function exportVideo(o: ExportOptions): Promise<Blob> {
  const { timeline, fps, width, height, signal } = o;
  const duration = timelineDuration(timeline);
  if (duration <= 0) throw new Error("The timeline is empty");
  // Prefer H.264/AAC; fall back to other MP4-compatible codecs the browser can encode.
  let vcodec: "avc" | "vp9" | "av1" | null = null;
  for (const c of ["avc", "vp9", "av1"] as const) {
    if (await canEncodeVideo(c, { width, height })) {
      vcodec = c;
      break;
    }
  }
  if (!vcodec) throw new Error("Your browser can't encode video at this size. Try Chrome or Edge, or a smaller size.");
  const acodec = (await canEncodeAudio("aac")) ? "aac" : (await canEncodeAudio("opus")) ? "opus" : null;
  const audioOk = acodec !== null;

  if (timeline.tracks.some((tr) => !tr.hidden && tr.clips.some((c) => c.fx?.some((f) => AI_EFFECTS.has(f.id))))) {
    o.onProgress(0, "Loading AI model");
    await ensureSegmenter().catch(() => {
      throw new Error("The AI background model couldn't load. Check your connection and try again.");
    });
  }
  o.onProgress(0, "Preparing audio");
  const mix = audioOk
    ? await mixTimelineAudio(timeline, o.assets, 48000, 2, (p, l) => o.onProgress(p * 0.1, l), signal)
    : null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error('Could not create the export canvas');

  const frame = document.createElement("canvas");
  frame.height = height; frame.width = Math.round(height * (o.sourceAspect ?? width/height));
  const frameCtx = frame.getContext("2d")!;
  const reframer = new Reframer();

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, { codec: vcodec, bitrate: Math.max(2_000_000, Math.round(width * height * 6)) });
  output.addVideoTrack(videoSource, { frameRate: fps });
  let audioSource: AudioBufferSource | null = null;
  if (mix && acodec) {
    audioSource = new AudioBufferSource({ codec: acodec, bitrate: QUALITY_HIGH });
    output.addAudioTrack(audioSource);
  }
  await output.start();

  // each visual clip stays decodable through its outgoing transition tail
  const visualClips: { c: Clip; end: number }[] = timeline.tracks
    .filter((tr) => tr.kind !== "audio" && !tr.hidden)
    .flatMap((tr) => tr.clips.map((c) => ({ c, end: clipEnd(c) + outgoingTail(tr, c) })));
  const endOf = new Map(visualClips.map((v) => [v.c.id, v.end]));
  const frames = new Map<string, ClipFrames>();
  const images = new Map<string, HTMLImageElement>();
  const totalFrames = Math.ceil(duration * fps);

  const openClip = async (c: Clip, firstFrame: number) => {
    const a = o.assets.get(c.assetId ?? '');
    if (!a) return;
    const input = new Input({ source: new UrlSource(await remoteUrl(a.storage_path)), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return;
    if (!(await track.canDecode())) throw new Error(`"${c.name}" uses a video format your browser can't decode`);
    // Preserve native source geometry; the shared renderer performs crop and fit.
    const sink = new CanvasSink(track);
    if (c.freezeAt !== undefined) {
      const held = await sink.getCanvas(c.freezeAt);
      frames.set(c.id, { input, gen: (async function* () {})(), current: held?.canvas ?? null });
      return;
    }
    const end = Math.min(totalFrames, Math.ceil((endOf.get(c.id) ?? clipEnd(c)) * fps));
    const maxT = Math.max(0, (await track.computeDuration()) - 0.001);
    const stamps: number[] = [];
    for (let i = firstFrame; i < end; i++) stamps.push(Math.min(maxT, Math.max(0, sourceTime(c, i / fps))));
    frames.set(c.id, { input, gen: sink.canvasesAtTimestamps(stamps), current: null });
  };

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
      const t = i / fps;
      for (const { c, end } of visualClips) {
        const active = t >= c.start && t < end;
        if (c.kind === "video") {
          if (active) {
            if (!frames.has(c.id)) await openClip(c, i);
            const f = frames.get(c.id);
            if (f) {
              const r = await f.gen.next();
              if (!r.done && r.value) f.current = r.value.canvas as CanvasImageSource;
            }
          } else if (frames.has(c.id) && t >= end) {
            const f = frames.get(c.id);
            if (!f) continue;
            await f.gen.return?.();
            f.input.dispose?.();
            frames.delete(c.id);
          }
        } else if (c.kind === "image" && active && c.assetId && !images.has(c.assetId)) {
          const a = o.assets.get(c.assetId);
          if (a) images.set(c.assetId, await loadImage(await remoteUrl(a.storage_path)));
        }
      }
      renderFrame(
        frameCtx,
        timeline,
        t,
        (c) => (c.kind === "video" ? (frames.get(c.id)?.current ?? null) : images.get(c.assetId ?? "") ?? null),
        { width: frame.width, height: frame.height, baseHeight: o.baseHeight, captions: o.captions },
      );
      const rect = cropRect(frame.width, frame.height, width/height, o.autoReframe ? reframer.sample(frame) : undefined);
      ctx.drawImage(frame, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height);
      await videoSource.add(t, 1 / fps);
      if (i % 5 === 0) o.onProgress(0.1 + 0.85 * (i / totalFrames), `Rendering frame ${i + 1} of ${totalFrames}`);
    }
    if (audioSource && mix) {
      o.onProgress(0.96, "Encoding audio");
      await audioSource.add(mix);
    }
    o.onProgress(0.98, "Finalizing MP4");
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    for (const f of frames.values()) f.input.dispose?.();
  }
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error("Export produced no data");
  o.onProgress(1, "Done");
  return new Blob([buf], { type: "video/mp4" });
}
