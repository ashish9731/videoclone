import { encodeWav } from "./sfx";

/**
 * Browser audio capture for the editor's Record feature. Kept free of React so the pure parts
 * (mime choice, blob -> lossless WAV) are unit-testable and the UI just orchestrates them.
 */
export type RecordingSource = "microphone" | "browser";

// preferred first: Opus in webm (Chrome/Firefox), then ogg/opus, then mp4 (Safari).
const CANDIDATE_MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

/** The first MediaRecorder container this browser actually supports ("" lets the browser pick). */
export function chooseRecorderMime(
  supported: (type: string) => boolean = (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
): string {
  return CANDIDATE_MIME.find(supported) ?? "";
}

/**
 * Ask for the chosen capture source. "microphone" is an external input; "browser" records the tab /
 * desktop audio (Chrome shows a "Share tab audio" checkbox the user must tick).
 */
export async function openStream(source: RecordingSource): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== "function") throw new Error("Recording is not supported in this browser.");
  if (source === "microphone") {
    // capture raw for clarity: no echo cancellation / noise suppression / auto-gain reshaping the waveform
    return md.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
  }
  // getDisplayMedia needs a video surface to offer tab audio; we keep only the audio track after.
  const display = await md.getDisplayMedia({ video: true, audio: true });
  const audio = display.getAudioTracks();
  if (!audio.length) {
    display.getTracks().forEach((t) => t.stop());
    throw new Error('No browser audio found — select the tab and turn on "Share tab audio".');
  }
  display.getVideoTracks().forEach((t) => t.stop());
  return new MediaStream(audio);
}

export interface Recorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

/** Start capturing; 256 kbps Opus keeps voice and music crisp. */
export function startRecorder(stream: MediaStream, mimeType: string): Recorder {
  const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 256_000 } : { audioBitsPerSecond: 256_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: mimeType || "audio/webm" })); });
  rec.start(250);
  return {
    stop: async () => {
      if (rec.state !== "inactive") rec.stop();
      const blob = await finished;
      stream.getTracks().forEach((t) => t.stop());
      return blob;
    },
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== "inactive") rec.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

type Decoder = (bytes: ArrayBuffer) => Promise<AudioBuffer>;

async function defaultDecode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const Ctor = typeof AudioContext !== "undefined" ? AudioContext : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is unavailable in this browser.");
  const ctx = new Ctor();
  try {
    return await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }
}

/**
 * Turn the captured blob into a lossless WAV: decoding to PCM gives an exact duration (MediaRecorder
 * webm often reports no length) and a file the export/transcription pipeline can range-read.
 */
export async function blobToWavFile(
  blob: Blob,
  name: string,
  decode: Decoder = defaultDecode,
): Promise<{ file: File; duration: number }> {
  const buffer = await decode(await blob.arrayBuffer());
  const file = new File([encodeWav(buffer)], `${name}.wav`, { type: "audio/wav" });
  return { file, duration: buffer.duration };
}

/** Map a DOMException to a plain-language prompt so the user knows what to allow. */
export function permissionMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Permission denied — allow access when your browser asks.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No matching audio device was found.";
  return e instanceof Error ? e.message : "Could not record audio.";
}
