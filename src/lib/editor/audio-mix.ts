import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from "mediabunny";
import { remoteUrl } from "./media";
import { clipGainAt, voiceClips } from "./audio-fx";
import { type MediaAsset, type Timeline, clipDuration, normCurve, timelineDuration } from "./types";

/** Decode the audio of [inS, outS) of a media file into one AudioBuffer. */
export async function decodeAudioRange(
  url: string,
  inS: number,
  outS: number,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    if (!(await track.canDecode())) throw new Error("This file's audio format can't be decoded in your browser");
    const sr = track.sampleRate;
    const ch = track.numberOfChannels;
    const len = Math.max(1, Math.ceil((outS - inS) * sr));
    const out = new AudioBuffer({ length: len, numberOfChannels: ch, sampleRate: sr });
    const sink = new AudioBufferSink(track);
    for await (const { buffer, timestamp } of sink.buffers(inS, outS)) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const offset = Math.round((timestamp - inS) * sr);
      for (let c = 0; c < ch; c++) {
        const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
        const dst = out.getChannelData(c);
        let s = 0;
        let d = offset;
        if (d < 0) {
          s = -d;
          d = 0;
        }
        const n = Math.min(src.length - s, dst.length - d);
        if (n > 0) dst.set(src.subarray(s, s + n), d);
      }
    }
    return out;
  } finally {
    input.dispose?.();
  }
}

/**
 * Render the full timeline audio mix (speed, volume, fades, mutes) offline.
 * Returns null when the timeline has no audible clips.
 */
export async function mixTimelineAudio(
  timeline: Timeline,
  assets: Map<string, MediaAsset>,
  sampleRate: number,
  channels: number,
  onProgress?: (p: number, label: string) => void,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const total = timelineDuration(timeline);
  if (total <= 0) return null;
  const audible = timeline.tracks
    // lanes are not sound-type buckets: the clip kind below decides what decodes, so audio
    // mixed from a media lane sounds identical to audio on a dedicated track
    .filter((tr) => !tr.muted)
    .flatMap((tr) => tr.clips)
    .filter((c) => (c.kind === "video" || c.kind === "audio") && c.freezeAt === undefined && c.volume > 0 && c.assetId);
  if (audible.length === 0) return null;

  const ctx = new OfflineAudioContext(channels, Math.ceil(total * sampleRate), sampleRate);
  let any = false;
  for (let i = 0; i < audible.length; i++) {
    const c = audible[i]!;
    const a = assets.get(c.assetId!);
    if (!a) continue;
    onProgress?.(i / audible.length, `Decoding audio: ${c.name}`);
    const buf = await decodeAudioRange(await remoteUrl(a.storage_path), c.in, c.out, signal);
    if (!buf) continue;
    any = true;
    const node = ctx.createBufferSource();
    node.buffer = buf;
    const d = clipDuration(c);
    const end = c.start + d;
    // speed ramp: piecewise-linear rate automation matches the curve's integral exactly
    const curve = normCurve(c.speedCurve);
    if (curve) {
      node.playbackRate.setValueAtTime(c.speed * curve[0]!.speed, c.start);
      for (const pt of curve.slice(1)) node.playbackRate.linearRampToValueAtTime(c.speed * pt.speed, c.start + pt.t * d);
    } else node.playbackRate.value = c.speed;
    // gain envelope (volume, fades, ducking) sampled at 100 Hz — same function the preview uses
    const voices = c.duck && c.duck > 0 ? voiceClips(timeline, c.id) : null;
    const n = Math.max(2, Math.ceil(d * 100) + 1);
    const curveG = new Float32Array(n);
    for (let j = 0; j < n; j++) curveG[j] = clipGainAt(c, c.start + (j / (n - 1)) * d, voices);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(curveG[0]!, c.start);
    if (d > 0.02) gain.gain.setValueCurveAtTime(curveG, c.start, d);
    node.connect(gain).connect(ctx.destination);
    node.start(c.start, 0);
    node.stop(end);
  }
  if (!any) return null;
  onProgress?.(1, "Mixing audio");
  return ctx.startRendering();
}
