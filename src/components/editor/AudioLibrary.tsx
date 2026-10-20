import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SOUNDS, renderSound, encodeWav, type Sound } from '@/lib/editor/sfx';
import { uploadMedia } from '@/lib/editor/media';
import { clipFromAsset, type MediaAsset } from '@/lib/editor/types';
import type { EditorStore } from '@/lib/editor/store';
import { addClipToTimeline } from './Timeline';

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
const buffers = new Map<string, Promise<AudioBuffer>>();
function getBuffer(sound: Sound) {
  let promise = buffers.get(sound.id);
  if (!promise) { promise = renderSound(sound); buffers.set(sound.id, promise); void promise.catch(() => buffers.delete(sound.id)); }
  return promise;
}
export function AudioLibrary({ store, userId, projectId, onAdded }: { store: EditorStore; userId: string; projectId: string; onAdded: (a: MediaAsset) => void }) {
  const [category, setCategory] = useState('All'), [search, setSearch] = useState(''), [playing, setPlaying] = useState<string | null>(null), [busy, setBusy] = useState<string | null>(null);
  const context = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null), request = useRef(0), adding = useRef(false);
  const stop = () => { request.current++; source.current?.stop(); source.current = null; setPlaying(null); };
  useEffect(() => () => { request.current++; source.current?.stop(); void context.current?.close(); }, []);
  const preview = async (sound: Sound) => {
    const wasPlaying = playing === sound.id; stop(); if (wasPlaying) return;
    const id = request.current;
    try {
      const ctx = context.current ??= new AudioContext(); await ctx.resume();
      const buffer = await getBuffer(sound); if (id !== request.current) return;
      const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination); source.current = node;
      node.onended = () => { if (source.current === node) { source.current = null; setPlaying(null); } }; node.start(); setPlaying(sound.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Preview failed'); }
  };
  const add = async (sound: Sound) => {
    if (adding.current) return;
    adding.current = true; setBusy(sound.id); const time = store.get().time;
    try {
      const buffer = await getBuffer(sound);
      const asset = await uploadMedia(new File([encodeWav(buffer)], `${sound.name}.wav`, { type: 'audio/wav' }), userId, projectId, () => {});
      onAdded(asset); addClipToTimeline(store, clipFromAsset(asset, time)); toast.success(`Added ${sound.name}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add sound'); }
    finally { adding.current = false; setBusy(null); }
  };
  const shown = SOUNDS.filter(s => (category === 'All' || s.category === category) && `${s.name} ${s.category}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="flex h-full min-h-0 flex-col gap-3 p-3">
    <div><h3 className="text-sm font-medium">Original audio · {SOUNDS.length} sounds</h3><p className="text-[10px] text-muted-foreground">Royalty-free synthesized music & sound effects</p></div>
    <input className="rounded border bg-background p-2 text-xs" aria-label="Search audio" placeholder="Search sounds…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="flex flex-wrap gap-1">{['All', 'Music beds', 'Drum loops', 'SFX'].map(c => <button key={c} aria-pressed={category === c} className={`rounded px-2 py-1 text-xs ${category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">{shown.map(sound => <div key={sound.id} className="rounded border p-2">
      <div className="flex justify-between gap-2 text-xs"><span>{sound.name}</span><span className="text-muted-foreground">{sound.duration.toFixed(2)}s</span></div>
      <Waveform sound={sound} getBuffer={getBuffer} />
      <div className="flex justify-between"><button className="text-xs text-primary" aria-label={`${playing === sound.id ? 'Stop' : 'Preview'} ${sound.name}`} onClick={() => void preview(sound)}>{playing === sound.id ? '■ Stop' : '▶ Preview'}</button><button className="text-xs text-primary disabled:opacity-50" disabled={busy !== null} aria-label={`Add ${sound.name}`} onClick={() => void add(sound)}>{busy === sound.id ? 'Uploading…' : '+ Add'}</button></div>
    </div>)}{!shown.length && <p className="text-xs text-muted-foreground">No sounds match your search.</p>}</div>
  </div>;
}
