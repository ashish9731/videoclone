import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SOUNDS, renderSound, encodeWav, type Sound } from '@/lib/editor/sfx';
import { uploadMedia } from '@/lib/editor/media';
import { clipFromAsset, type MediaAsset } from '@/lib/editor/types';
import type { EditorStore } from '@/lib/editor/store';
import { useEditor } from '@/lib/editor/store';
import { addClipToTimeline } from '@/lib/editor/placement';
import { AudioRecorder } from './AudioRecorder';

function Waveform({ sound, getBuffer }: { sound: Sound; getBuffer: (s: Sound) => Promise<AudioBuffer> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    void getBuffer(sound).then(buffer => {
      if (!active) return;
      const ctx = ref.current?.getContext('2d'); if (!ctx) return;
      const data = buffer.getChannelData(0); ctx.clearRect(0, 0, 240, 32); ctx.fillStyle = '#55cdb2';
      for (let x = 0; x < 120; x++) {
        let peak = 0;
        for (let i = Math.floor(x * data.length / 120); i < (x + 1) * data.length / 120; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0));
        const h = Math.max(1, peak * 30); ctx.fillRect(x * 2, (32 - h) / 2, 1, h);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [sound, getBuffer]);
  return <canvas ref={ref} width={240} height={32} className="h-8 w-full" aria-label={`${sound.name} waveform`} />;
}
let sharedCtx: AudioContext | null = null;
/** One page-wide AudioContext, reused for decoding real files and for playback so we never open a second. */
function ensureCtx(): AudioContext { return (sharedCtx ??= new AudioContext()); }
/** A `url` sound plays its bundled recording; everything else is synthesized on demand. */
async function loadSound(sound: Sound): Promise<AudioBuffer> {
  if (!sound.url) return renderSound(sound);
  const res = await fetch(sound.url);
  if (!res.ok) throw new Error(`Missing audio file for ${sound.name}`);
  return ensureCtx().decodeAudioData(await res.arrayBuffer());
}
/** Upload the bundled recording as-is (keeping its format/quality) instead of re-encoding to WAV. */
async function fileFromUrl(sound: Sound): Promise<File> {
  const res = await fetch(sound.url!);
  if (!res.ok) throw new Error(`Missing audio file for ${sound.name}`);
  const blob = await res.blob();
  const ext = sound.url!.split('.').pop() ?? 'wav';
  const type = ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : `audio/${ext}`;
  return new File([blob], `${sound.name}.${ext}`, { type });
}
const buffers = new Map<string, Promise<AudioBuffer>>();
function getBuffer(sound: Sound) {
  let promise = buffers.get(sound.id);
  if (!promise) { promise = loadSound(sound); buffers.set(sound.id, promise); void promise.catch(() => buffers.delete(sound.id)); }
  return promise;
}
export function AudioLibrary({ store, userId, projectId, onAdded }: { store: EditorStore; userId: string; projectId: string; onAdded: (a: MediaAsset) => void }) {
  const [category, setCategory] = useState('All'), [search, setSearch] = useState(''), [playing, setPlaying] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null), request = useRef(0), adding = useRef(false);
  const stop = () => { request.current++; source.current?.stop(); source.current = null; setPlaying(null); };
  // a sound effect preview is not part of the edit: any play/pause of the timeline mutes it so the
  // library can never keep sounding while the preview itself is stopped
  const transport = useEditor(store, (s) => s.playing);
  const lastTransport = useRef(transport);
  useEffect(() => {
    if (lastTransport.current === transport) return;
    lastTransport.current = transport;
    request.current++;
    source.current?.stop();
    source.current = null;
    setPlaying(null);
  }, [transport]);
  useEffect(() => () => { request.current++; source.current?.stop(); }, []);
  const preview = async (sound: Sound) => {
    const wasPlaying = playing === sound.id; stop(); if (wasPlaying) return;
    const id = request.current;
    try {
      const ctx = ensureCtx(); await ctx.resume();
      const buffer = await getBuffer(sound); if (id !== request.current) return;
      const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination); source.current = node;
      node.onended = () => { if (source.current === node) { source.current = null; setPlaying(null); } }; node.start(); setPlaying(sound.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Preview failed'); }
  };
  const add = async (sound: Sound) => {
    if (adding.current) return;
    adding.current = true; setBusy(sound.id); const time = store.get().time;
    try {
      const asset = sound.url
        ? await uploadMedia(await fileFromUrl(sound), userId, projectId, () => {})
        : await uploadMedia(new File([encodeWav(await getBuffer(sound))], `${sound.name}.wav`, { type: 'audio/wav' }), userId, projectId, () => {});
      onAdded(asset); addClipToTimeline(store, clipFromAsset(asset, time)); toast.success(`Added ${sound.name}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add sound'); }
    finally { adding.current = false; setBusy(null); }
  };
  const shown = SOUNDS.filter(s => (category === 'All' || s.category === category) && `${s.name} ${s.category}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="flex h-full min-h-0 flex-col gap-3 p-3">
    <div><h3 className="text-sm font-medium">Original audio · {SOUNDS.length} sounds</h3><p className="text-[10px] text-muted-foreground">Royalty-free music &amp; sound effects</p></div>
    <AudioRecorder store={store} userId={userId} projectId={projectId} onAdded={onAdded} />
    <input className="rounded border bg-background p-2 text-xs" aria-label="Search audio" placeholder="Search sounds…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="flex flex-wrap gap-1">{['All', ...Array.from(new Set(SOUNDS.map(s => s.category)))].map(c => <button key={c} aria-pressed={category === c} className={`rounded px-2 py-1 text-xs ${category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{shown.map(sound => <div key={sound.id} className="rounded border p-2">
      <div className="flex justify-between gap-2 text-xs"><span>{sound.name}</span><span className="text-muted-foreground">{sound.duration.toFixed(2)}s</span></div>
      <Waveform sound={sound} getBuffer={getBuffer} />
      <div className="flex justify-between"><button className="text-xs text-primary" aria-label={`${playing === sound.id ? 'Stop' : 'Preview'} ${sound.name}`} onClick={() => void preview(sound)}>{playing === sound.id ? '■ Stop' : '▶ Preview'}</button><button className="text-xs text-primary disabled:opacity-50" disabled={busy !== null} aria-label={`Add ${sound.name}`} onClick={() => void add(sound)}>{busy === sound.id ? 'Uploading…' : '+ Add'}</button></div>
    </div>)}{!shown.length && <p className="text-xs text-muted-foreground">No sounds match your search.</p>}</div>
  </div>;
}
