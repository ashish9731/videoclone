import { supabase } from "@/integrations/supabase/client";
import type { MediaAsset, MediaKind } from "./types";

export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB

const urlCache = new Map<string, { url: string; exp: number }>();
const localFiles = new Map<string, string>(); // storage_path -> object URL (this session)

/** Fast URL for playback: in-session local file when available, otherwise signed URL. */
export async function signedUrl(path: string): Promise<string> {
  const local = localFiles.get(path);
  if (local) return local;
  return remoteUrl(path);
}

/** Signed server URL (supports range requests) — used by the decoding pipelines. */
export async function remoteUrl(path: string): Promise<string> {
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 6);
  if (error || !data) throw new Error(error?.message ?? "Could not access media file");
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 6 * 3600_000 });
  return data.signedUrl;
}

export function kindFromMime(mime: string, name: string): MediaKind | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "mkv", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  return null;
}

export async function probeFile(
  file: File,
  kind: MediaKind,
): Promise<{ duration: number; width: number | null; height: number | null }> {
  try {
    return await probeWithElement(file, kind);
  } catch (e) {
    if (kind === "image") throw e;
    // Fall back to container parsing (e.g. codecs the <video> element can't play)
    const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const duration = await input.computeDuration();
      const v = kind === "video" ? await input.getPrimaryVideoTrack() : null;
      if (!duration) throw e;
      return { duration, width: v ? v.displayWidth : null, height: v ? v.displayHeight : null };
    } catch {
      throw e;
    } finally {
      input.dispose?.();
    }
  }
}

function probeWithElement(
  file: File,
  kind: MediaKind,
): Promise<{ duration: number; width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    if (kind === "image") {
      const img = new Image();
      img.onload = () => resolve({ duration: 0, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("This image could not be read"));
      img.src = url;
      return;
    }
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      resolve({
        duration: isFinite(el.duration) ? el.duration : 0,
        width: kind === "video" ? v.videoWidth : null,
        height: kind === "video" ? v.videoHeight : null,
      });
    };
    el.onerror = () => reject(new Error("This file format can't be played in your browser"));
    el.src = url;
  });
}

export async function uploadMedia(
  file: File,
  userId: string,
  projectId: string,
  onProgress: (p: number) => void,
): Promise<MediaAsset> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 1 GB or smaller");
  const kind = kindFromMime(file.type, file.name);
  if (!kind) throw new Error("Unsupported file type");
  const meta = await probeFile(file, kind);
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Please sign in again");
  const base = import.meta.env['VITE_SUPABASE_URL'] as string;
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/media/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(file);
  });

  localFiles.set(path, URL.createObjectURL(file));
  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      user_id: userId,
      project_id: projectId,
      storage_path: path,
      name: file.name,
      kind,
      mime: file.type || "application/octet-stream",
      size_bytes: file.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save media");
  return data as MediaAsset;
}

export async function deleteMedia(a: MediaAsset) {
  await supabase.storage.from("media").remove([a.storage_path]);
  const { error } = await supabase.from("media_assets").delete().eq("id", a.id);
  if (error) throw new Error(error.message);
}
