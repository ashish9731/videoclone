import { useSyncExternalStore } from "react";
import type { ClipboardItem } from "./clipboard";
import { type Clip, type Timeline, type Track, type Watermark, defaultWatermark } from "./types";

export interface EditorState {
  timeline: Timeline;
  /**
   * The project watermark lives here, NOT inside `timeline`, so no `{ tracks }` transform, drag,
   * trim or undo/redo snapshot can drop it. It is a project setting the user turns on once and only
   * the user turns off; `renderFrame`/export read it from here via RenderOptions, and the editor
   * route persists it back into the timeline JSON on save. It is intentionally kept out of the
   * undo history so Undo can never be the thing that "removed" a watermark the user still wants.
   */
  watermark: Watermark;
  selectedClipId: string | null;
  /**
   * Multi-selection set activated by Ctrl+A: every clip id currently highlighted on the timeline.
   * When non-empty, the single `selectedClipId` is also included. Cleared by clicking empty space
   * or pressing Escape.
   */
  selectedClipIds: string[];
  /**
   * id of the clip whose in-transition is being edited as an object of its own. Only a click on
   * the transition block sets it, and any other selection clears it (see `set`), so Delete knows
   * whether it removes a blend or the clip under it.
   */
  selectedTransitionOf: string | null;
  /**
   * id of the caption cue the user pointed at on its own lane. Captions live outside the timeline
   * JSON, so this is the only way Copy knows a cue was meant rather than the clip under the playhead.
   */
  selectedCueId: string | null;
  /** the one object held for pasting, kept on the store because it is not text and not undoable */
  clipboard: ClipboardItem | null;
  time: number;
  playing: boolean;
  pxPerSec: number;
  snapping: boolean;
  /** when on, on-canvas transforms create keyframes at the playhead */
  animate: boolean;
  /** which inspector tab is open */
  inspectorTab: string;
  canUndo: boolean;
  canRedo: boolean;
  version: number; // increments on each timeline change (for autosave)
}

type Listener = () => void;

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  private past: Timeline[] = [];
  private future: Timeline[] = [];
  private gestureBase: Timeline | null = null;

  constructor(timeline: Timeline) {
    this.state = {
      timeline,
      watermark: timeline.watermark ?? defaultWatermark(),
      selectedClipId: null,
      selectedClipIds: [],
      selectedTransitionOf: null,
      selectedCueId: null,
      clipboard: null,
      time: 0,
      playing: false,
      pxPerSec: 60,
      snapping: true,
      animate: false,
      inspectorTab: "basic",
      canUndo: false,
      canRedo: false,
      version: 0,
    };
  }

  get = () => this.state;
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private emit() {
    this.listeners.forEach((l) => l());
  }

  set(partial: Partial<EditorState>) {
    const next = { ...this.state, ...partial };
    // Selecting anything else - a clip body, an empty lane, a clear - drops the transition
    // selection, otherwise Del would keep deleting a blend the user stopped pointing at.
    if (partial.selectedClipId !== undefined && !("selectedTransitionOf" in partial)) {
      next.selectedTransitionOf = null;
    }
    // and the same for a caption cue: one object is the target at a time
    if (partial.selectedClipId !== undefined && !("selectedCueId" in partial))
      next.selectedCueId = null;
    if (partial.selectedCueId !== undefined && !("selectedClipId" in partial))
      next.selectedClipId = null;
    // clicking a single clip or clearing drops the multi-selection unless explicitly provided
    if (partial.selectedClipId !== undefined && !("selectedClipIds" in partial))
      next.selectedClipIds = [];
    this.state = next;
    this.emit();
  }

  /** Select every clip on the timeline (Ctrl+A). */
  selectAllClips() {
    const ids: string[] = [];
    for (const tr of this.state.timeline.tracks) {
      for (const c of tr.clips) ids.push(c.id);
    }
    this.state = {
      ...this.state,
      selectedClipIds: ids,
      selectedClipId: ids[0] ?? null,
    };
    this.emit();
  }

  private commitTimeline(next: Timeline, pushHistory: boolean) {
    if (pushHistory) {
      this.past.push(this.state.timeline);
      if (this.past.length > 200) this.past.shift();
      this.future = [];
    }
    this.state = {
      ...this.state,
      timeline: next,
      canUndo: this.past.length > 0 || this.gestureBase !== null,
      canRedo: this.future.length > 0,
      version: this.state.version + 1,
    };
    this.emit();
  }

  /** Apply a timeline change. During a gesture, history is recorded once at endGesture. */
  update(fn: (t: Timeline) => Timeline) {
    this.commitTimeline(fn(this.state.timeline), this.gestureBase === null);
  }

  /** Change the watermark without touching the timeline or its undo history; bumps autosave. */
  setWatermark(wm: Watermark) {
    this.state = { ...this.state, watermark: wm, version: this.state.version + 1 };
    this.emit();
  }

  beginGesture() {
    this.gestureBase = this.state.timeline;
  }
  endGesture() {
    if (this.gestureBase && this.gestureBase !== this.state.timeline) {
      this.past.push(this.gestureBase);
      this.future = [];
    }
    this.gestureBase = null;
    this.set({ canUndo: this.past.length > 0, canRedo: this.future.length > 0 });
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.timeline);
    this.commitTimeline(prev, false);
  }
  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.timeline);
    this.commitTimeline(next, false);
  }

  updateClip(id: string, fn: (c: Clip) => Clip) {
    this.update((t) => ({
      tracks: t.tracks.map((tr) => ({
        ...tr,
        clips: tr.clips.map((c) => (c.id === id ? fn(c) : c)),
      })),
    }));
  }
  updateTrack(id: string, fn: (tr: Track) => Track) {
    this.update((t) => ({ tracks: t.tracks.map((tr) => (tr.id === id ? fn(tr) : tr)) }));
  }

  findClip(id: string | null): { clip: Clip; track: Track } | null {
    if (!id) return null;
    for (const track of this.state.timeline.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return { clip, track };
    }
    return null;
  }
}

export function useEditor<T>(store: EditorStore, sel: (s: EditorState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => sel(store.get()),
    () => sel(store.get()),
  );
}
