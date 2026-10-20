import { type Clip, type KeyframeProp, interpolate } from "./types";

export const KF_EPS = 1 / 60;

export function poseAt(c: Clip, local: number) {
  return {
    x: interpolate(c.keyframes.x, local, c.transform.x),
    y: interpolate(c.keyframes.y, local, c.transform.y),
    scale: interpolate(c.keyframes.scale, local, c.transform.scale),
    rotation: interpolate(c.keyframes.rotation, local, c.transform.rotation),
    opacity: interpolate(c.keyframes.opacity, local, c.transform.opacity),
  };
}

/**
 * Set transform props at a clip-local time. A prop that already has keyframes
 * (or every prop when `record` is on) gets a keyframe upserted at that time;
 * otherwise the static base transform changes.
 */
export function applyAnimated(
  c: Clip,
  local: number,
  patch: Partial<Record<KeyframeProp, number>>,
  record: boolean,
): Clip {
  let transform = c.transform;
  const keyframes = { ...c.keyframes };
  for (const [p, v] of Object.entries(patch) as [KeyframeProp, number][]) {
    const arr = keyframes[p];
    if ((arr && arr.length) || record) {
      const list = arr ?? [];
      const exists = list.some((k) => Math.abs(k.t - local) < KF_EPS);
      keyframes[p] = exists
        ? list.map((k) => (Math.abs(k.t - local) < KF_EPS ? { ...k, value: v } : k))
        : [...list, { t: local, value: v }];
    } else {
      transform = { ...transform, [p]: v };
    }
  }
  return { ...c, transform, keyframes };
}
