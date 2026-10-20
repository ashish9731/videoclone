import { supabase } from "@/integrations/supabase/client";
import { mixTimelineAudio } from "./audio-mix";
import { type CaptionCue, type MediaAsset, type Timeline, uid } from "./types";

export interface Segment {
  start: number;
  end: number;
}

/** Energy-based speech detection: returns speech segments between ~0.4s and maxLen seconds. */
export function detectSpeechSegments(samples: Float32Array, sr: number, maxLen = 6): Segment[] {
  const win = Math.round(sr * 0.03);
  const n = Math.floor(samples.length / win);
  if (n === 0) return [];
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * win; j < (i + 1) * win; j++) s += samples[j]! * samples[j]!;
    rms[i] = Math.sqrt(s / win);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.2)] ?? 0;
  const thresh = Math.max(floor * 2.5, 0.006);
  const winS = win / sr;

  // raw speech regions
  const raw: Segment[] = [];
  let st = -1;
  for (let i = 0; i < n; i++) {
    const on = rms[i]! > thresh;
    if (on && st < 0) st = i;
    if (!on && st >= 0) {
      raw.push({ start: st * winS, end: i * winS });
      st = -1;
    }
  }
  if (st >= 0) raw.push({ start: st * winS, end: n * winS });

  // merge small gaps
  const merged: Segment[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < 0.4) last.end = r.end;
    else merged.push({ ...r });
  }

  // split long segments at the quietest window
  const out: Segment[] = [];
  const split = (s: Segment): void => {
    if (s.end - s.start <= maxLen) {
      out.push(s);
      return;
    }
    const a = Math.floor((s.start + 2) / winS);
    const b = Math.floor((s.end - 2) / winS);
    let best = Math.floor((s.start + maxLen * 0.8) / winS);
    let bestV = Infinity;
    for (let i = a; i <= Math.min(b, Math.floor((s.start + maxLen) / winS)); i++) {
      if (rms[i]! < bestV) {
        bestV = rms[i]!;
        best = i;
      }
    }
    const cut = best * winS;
    split({ start: s.start, end: cut });
    split({ start: cut, end: s.end });
  };
  merged.filter((m) => m.end - m.start >= 0.35).forEach(split);
  const total = samples.length / sr;
  return out.map((s) => ({ start: Math.max(0, s.start - 0.1), end: Math.min(total, s.end + 0.15) }));
}

export function encodeWav(samples: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Break a long transcript into readable cues, timing each piece by its share of characters. */
export function splitCueText(start: number, end: number, text: string, maxChars = 42): { start: number; end: number; text: string }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    const breakAfter = /[.!?,;:]$/.test(cur) && cur.length > maxChars * 0.5;
    if ((next.length > maxChars || breakAfter) && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  let t = start;
  return lines.map((l) => {
    const d = ((end - start) * l.length) / total;
    const piece = { start: t, end: t + d, text: l };
    t += d;
    return piece;
  });
}

export class StopError extends Error {}

async function transcribeChunk(wav: Blob, language: string | undefined, signal: AbortSignal): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new StopError("Please sign in again");
    const form = new FormData();
    form.append("file", new File([wav], "chunk.wav", { type: "audio/wav" }));
    if (language) form.append("language", language);
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal,
    });
    if (res.ok) return ((await res.json()) as { text: string }).text.trim();
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, (ra > 0 ? ra * 1000 : 1000 * 2 ** attempt) + Math.random() * 400));
      continue;
    }
    throw new StopError(body.error ?? `Transcription failed (${res.status})`);
  }
  throw new StopError("Transcription service is busy. Please try again in a minute.");
}

export async function transcribeTimeline(
  timeline: Timeline,
  assets: Map<string, MediaAsset>,
  language: string | undefined,
  onProgress: (p: number, label: string) => void,
  signal: AbortSignal,
): Promise<CaptionCue[]> {
  const SR = 16000;
  const mix = await mixTimelineAudio(timeline, assets, SR, 1, (p, l) => onProgress(p * 0.15, l), signal);
  if (!mix) throw new StopError("There's no audio on the timeline to transcribe");
  const samples = mix.getChannelData(0);
  const segs = detectSpeechSegments(samples, SR);
  if (segs.length === 0) throw new StopError("No speech was detected in the timeline audio");
  const cues: CaptionCue[][] = segs.map(() => []);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < segs.length) {
      const i = next++;
      if (signal.aborted) return;
      const s = segs[i]!;
      const wav = encodeWav(samples.subarray(Math.floor(s.start * SR), Math.ceil(s.end * SR)), SR);
      const text = await transcribeChunk(wav, language, signal);
      if (text) cues[i] = splitCueText(s.start, s.end, text).map((p) => ({ id: uid(), ...p }));
      done++;
      onProgress(0.15 + 0.85 * (done / segs.length), `Transcribing ${done} of ${segs.length}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return cues.flat();
}
