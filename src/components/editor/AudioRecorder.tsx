import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { clipFromAsset, type MediaAsset } from '@/lib/editor/types';
import type { EditorStore } from '@/lib/editor/store';
import { addClipToTimeline } from '@/lib/editor/placement';
import { uploadMedia } from '@/lib/editor/media';
import {
  openStream,
  startRecorder,
  chooseRecorderMime,
  blobToWavFile,
  permissionMessage,
  type RecordingSource,
  type Recorder,
} from '@/lib/editor/recorder';

type Phase = 'idle' | 'choose' | 'recording' | 'review';
interface Take { wav: Blob; url: string; duration: number }

const defaultName = () => `Recording ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const primary = 'rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50';
const secondary = 'rounded bg-secondary px-2 py-1 text-xs disabled:opacity-50';

/**
 * In-panel audio recorder. It first asks the source (Microphone = an external input, Browser = the
 * tab/desktop audio), captures at a high bitrate, and hands back a lossless WAV so the clip length is
 * exact. Saving uploads to the media bucket (Supabase) so the take becomes a reusable project sound.
 */
export function AudioRecorder({ store, userId, projectId, onAdded }: { store: EditorStore; userId: string; projectId: string; onAdded: (a: MediaAsset) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [take, setTake] = useState<Take | null>(null);

  const recorder = useRef<Recorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const asset = useRef<MediaAsset | null>(null);
  const takeRef = useRef<Take | null>(null); takeRef.current = take;

  const clearTimer = () => { if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; } };
  const releaseStream = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  // never leak the mic/display handle, the ticking interval or the preview object URL
  useEffect(() => () => { clearTimer(); recorder.current?.cancel(); releaseStream(); if (takeRef.current) URL.revokeObjectURL(takeRef.current.url); }, []);

  const reset = () => { asset.current = null; if (takeRef.current) URL.revokeObjectURL(takeRef.current.url); setTake(null); setName(''); setSeconds(0); };

  const start = async (source: RecordingSource) => {
    try {
      const s = await openStream(source);
      stream.current = s;
      recorder.current = startRecorder(s, chooseRecorderMime());
      setSeconds(0);
      setPhase('recording');
      timer.current = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    } catch (e) {
      releaseStream();
      toast.error(permissionMessage(e));
      setPhase('idle');
    }
  };

  const stop = async () => {
    clearTimer();
    const rec = recorder.current;
    if (!rec) { setPhase('idle'); return; }
    setBusy(true);
    try {
      const blob = await rec.stop();
      recorder.current = null;
      releaseStream();
      const { file, duration } = await blobToWavFile(blob, name.trim() || defaultName());
      setTake({ wav: file, url: URL.createObjectURL(file), duration });
      setName(name.trim() || defaultName());
      setPhase('review');
    } catch (e) {
      toast.error(permissionMessage(e));
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  };

  const ensureUploaded = async (): Promise<MediaAsset> => {
    if (!takeRef.current) throw new Error('Nothing recorded yet');
    if (asset.current) return asset.current;
    const label = name.trim() || defaultName();
    const file = new File([takeRef.current.wav], `${label}.wav`, { type: 'audio/wav' });
    asset.current = await uploadMedia(file, userId, projectId, () => {});
    onAdded(asset.current); // persists the row in Supabase and surfaces it in the project
    return asset.current;
  };

  const addToTimeline = async () => {
    setBusy(true);
    try {
      const a = await ensureUploaded();
      addClipToTimeline(store, clipFromAsset(a, store.get().time));
      toast.success('Recording added to the timeline');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add recording'); }
    finally { setBusy(false); }
  };

  const saveToLibrary = async () => {
    setBusy(true);
    try { await ensureUploaded(); toast.success('Recording saved to your project'); setPhase('idle'); reset(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save recording'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded border p-2 text-xs">
      {phase === 'idle' && <button className={primary} onClick={() => setPhase('choose')}>● Record audio</button>}

      {phase === 'choose' && (
        <div className="space-y-2">
          <p className="font-medium">What should we record?</p>
          <div className="flex flex-wrap gap-2">
            <button className={primary} onClick={() => void start('microphone')}>🎙 Microphone (external)</button>
            <button className={secondary} onClick={() => void start('browser')}>🔊 Browser / tab audio</button>
          </div>
          <p className="text-[10px] text-muted-foreground">Microphone captures an outside source. Browser records the audio this tab plays (allow “Share tab audio” when prompted).</p>
          <input aria-label="Recording name" className="w-full rounded border bg-background p-1.5" placeholder="Name this recording" value={name} onChange={(e) => { setName(e.target.value); asset.current = null; }} />
          <button className={secondary} onClick={() => setPhase('idle')}>Cancel</button>
        </div>
      )}

      {phase === 'recording' && (
        <div className="flex items-center justify-between gap-2">
          <span aria-live="polite" className="text-red-500">● Recording… {mmss(seconds)}</span>
          <button className={primary} disabled={busy} onClick={() => void stop()}>■ Stop</button>
        </div>
      )}

      {phase === 'review' && take && (
        <div className="space-y-2">
          <audio controls src={take.url} className="w-full" aria-label="Recording preview" />
          <div className="flex justify-between text-[10px] text-muted-foreground"><span>{take.duration.toFixed(2)}s</span><span>WAV · lossless</span></div>
          <input aria-label="Recording name" className="w-full rounded border bg-background p-1.5" value={name} onChange={(e) => { setName(e.target.value); asset.current = null; }} />
          <div className="flex flex-wrap gap-2">
            <button className={primary} disabled={busy} onClick={() => void addToTimeline()}>+ Add to timeline</button>
            <button className={secondary} disabled={busy} onClick={() => void saveToLibrary()}>Save to library</button>
            <button className={secondary} disabled={busy} onClick={() => { reset(); setPhase('choose'); }}>Re-record</button>
            <button className={secondary} disabled={busy} onClick={() => { reset(); setPhase('idle'); }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
