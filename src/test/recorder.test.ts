import { describe, expect, it } from "vitest";
import { chooseRecorderMime, blobToWavFile, permissionMessage } from "@/lib/editor/recorder";

// a stand-in AudioBuffer so the WAV serializer is tested without a live Web Audio decoder
const fakeBuffer = (channels: number, frames: number, sampleRate = 8000) =>
  ({
    numberOfChannels: channels,
    length: frames,
    sampleRate,
    duration: frames / sampleRate,
    getChannelData: (c: number) => new Float32Array(frames).fill(c === 0 ? 0.5 : -0.5),
  }) as unknown as AudioBuffer;

// jsdom's Blob has no .arrayBuffer(), so read the produced file with FileReader
const readView = (blob: Blob) =>
  new Promise<DataView>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new DataView(fr.result as ArrayBuffer));
    fr.onerror = () => reject(new Error("read failed"));
    fr.readAsArrayBuffer(blob);
  });

// blobToWavFile only needs arrayBuffer() from the input blob (decode is injected below)
const stubBlob = { arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob;

describe("recorder pipeline", () => {
  it("picks the first supported container, else an empty string", () => {
    expect(chooseRecorderMime((t) => t === "audio/ogg;codecs=opus")).toBe("audio/ogg;codecs=opus");
    expect(chooseRecorderMime(() => false)).toBe("");
  });

  it("writes a lossless mono WAV with an exact duration", async () => {
    const buf = fakeBuffer(1, 100, 8000);
    const { file, duration } = await blobToWavFile(stubBlob, "Voice Note", async () => buf);
    expect(file.name).toBe("Voice Note.wav");
    expect(file.type).toBe("audio/wav");
    expect(duration).toBeCloseTo(100 / 8000, 6);
    expect(file.size).toBe(44 + 100 * 2);
    const header = await readView(file);
    expect(header.getUint16(22, true)).toBe(1); // numChannels
    expect(header.getUint32(24, true)).toBe(8000); // sample rate
    expect(header.getUint32(40, true)).toBe(200); // data size
  });

  it("interleaves two channels for a stereo take", async () => {
    const buf = fakeBuffer(2, 60, 16000);
    const { file } = await blobToWavFile(stubBlob, "Stereo", async () => buf);
    expect(file.size).toBe(44 + 60 * 2 * 2);
    const header = await readView(file);
    expect(header.getUint16(22, true)).toBe(2); // numChannels
    expect(header.getUint16(32, true)).toBe(4); // block align = channels * 2
    expect(header.getUint16(34, true)).toBe(16); // bits per sample
    // channel sample for frame 0 (L=+0.5 then R=-0.5) is written interleaved
    expect(header.getInt16(44, true)).toBeGreaterThan(0);
    expect(header.getInt16(46, true)).toBeLessThan(0);
  });

  it("explains a denied permission plainly", () => {
    expect(permissionMessage(new DOMException("x", "NotAllowedError"))).toMatch(/Permission denied/);
    expect(permissionMessage(new Error("boom"))).toBe("boom");
  });
});
