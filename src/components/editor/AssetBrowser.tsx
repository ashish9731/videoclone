import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Search, Plus, Star, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { type EditorStore, useEditor } from '@/lib/editor/store';
import { type Clip, clipDuration, defaultEffects, textClip } from '@/lib/editor/types';
import { FILTERS, EFFECTS } from '@/lib/editor/fx';
import { TRANSITIONS, nextAdjacent, prevAdjacent, drawTransition } from '@/lib/editor/transitions';
import { TEXT_TEMPLATES, clipFromTemplate, shapeClip } from '@/lib/editor/presets';
import { SHAPES } from '@/lib/editor/shapes';
import { renderClipLayer } from '@/lib/editor/render';
import { addClipToTimeline } from './Timeline';
import { AdjustPanel } from './Inspector';
import { cn } from '@/lib/utils';
import presetSource from '@/assets/preset-source.jpg';
import { ART_STICKERS } from '@/lib/editor/stickers';
import { presetTarget, visiblePresetTime } from '@/lib/editor/placement';

export type LibraryTab = 'Media' | 'Audio' | 'Text' | 'Stickers' | 'Effects' | 'Transitions' | 'Captions' | 'Filters' | 'Adjustment' | 'AI avatar';
const CATEGORY: Record<LibraryTab, string[]> = {
  Media: ['Media'],
  Audio: ['Audio'],
  Text: ['Add text', 'Yours', 'Trending', 'Classic', 'Animation', 'Text template'],
  Stickers: ['Yours', 'Trending', 'Smileys', 'Love', 'Party', 'Food', 'Nature', 'Weather', 'Music', 'Symbols', 'Animal Meme', 'Faces', 'Arrows', 'Badges', 'Bubbles', 'Shapes', 'Animals', 'Celebration', 'Icons'],
  Effects: ['Favorites', 'Trending', 'Basic', 'Distort', 'Retro', 'Party', 'Lens', 'Split', 'Nature'],
  Transitions: ['Favorites', 'Trending', 'Basic', 'Slide', 'Wipe', 'Camera', 'Effects', 'Shape'],
  Captions: ['Captions'],
  Filters: ['Favorites', 'Trending', ...new Set(FILTERS.map(f => f.group))],
  Adjustment: ['Color'],
  'AI avatar': ['Talking avatar'],
};
type Item = { id: string; name: string; group: string; clip?: Clip | undefined; apply: () => void };
const UNAVAILABLE = new Set(['B.Duck', 'Nailoong', 'Free Fire', 'AI packaging', 'Textile Art', 'Subprojects', 'Generate', 'Spaces', 'Library', 'Body effects', '3D', 'Magic cutout']);

function PresetPreview({ item, tab, selected, height }: { item: Item; tab: LibraryTab; selected: Clip | undefined; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = ref.current, ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const t = over && !matchMedia('(prefers-reduced-motion: reduce)').matches ? (performance.now() / 1000) % 2 : 0.65;
      const sample = document.createElement('canvas'); sample.width = 160; sample.height = 90;
      const sx = sample.getContext('2d');
      const live = document.querySelector<HTMLCanvasElement>('canvas[data-preview]');
      const useLive = (tab === 'Effects' || tab === 'Transitions' || tab === 'Filters') && !!live && live.width > 0 && live.height > 0;
      if (sx && useLive && live) {
        // Preview the preset on the actual timeline frame (cover-fit) so hovering shows the real look.
        const lr = live.width / live.height, tr = 160 / 90;
        let sw = live.width, sh = live.height, ox = 0, oy = 0;
        if (lr > tr) { sw = live.height * tr; ox = (live.width - sw) / 2; } else { sh = live.width / tr; oy = (live.height - sh) / 2; }
        sx.fillStyle = '#12141a'; sx.fillRect(0, 0, 160, 90);
        sx.drawImage(live, ox, oy, sw, sh, 0, 0, 160, 90);
      } else if (sx && photo.complete && photo.naturalWidth) { sx.drawImage(photo, 0, 0, 160, 90); }
      else if (sx) { photo.onload = () => { photo.onload = null; draw(); }; return; }
      const source = sample;
      let c: Clip = item.clip ?? { ...textClip(0), kind: 'video', text: undefined, out: 4 };
      if (!item.clip && selected && selected.kind !== 'audio') c = { ...selected, start: 0, in: 0, out: 4, speed: 1, speedCurve: undefined, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, keyframes: {}, effects: defaultEffects(), filter: undefined, fx: undefined, anim: undefined };
      if (tab === 'Effects') c = { ...c, fx: [{ id: item.id, intensity: 75 }] };
      if (tab === 'Filters') c = { ...c, filter: { id: item.id, intensity: 100 } };
      if (item.clip) c = { ...c, transform: { ...c.transform, x: 0, y: 0, scale: c.kind === 'shape' ? 2.6 : 1.8 } };
      ctx.clearRect(0, 0, 160, 90);
      if (tab === 'Effects' && !over) {
        // Animated effects: show three moments side by side so time-varying looks are visible at rest.
        [0.25, 0.5, 1.3].forEach((tt, i) => { const L = renderClipLayer(`thumb-${tab}-${item.id}-${i}`, c, tt, () => source, 160, 90, height); if (L) ctx.drawImage(L, i * 53, 0, 54, 90, i * 53, 0, 54, 90); });
        if (over) raf = requestAnimationFrame(draw);
        return;
      }
      const layer = renderClipLayer(`thumb-${tab}-${item.id}`, c, t, () => source, 160, 90, height);
      if (tab === 'Transitions') { const outgoing = document.createElement('canvas'); outgoing.width = 160; outgoing.height = 90; const ox = outgoing.getContext('2d'); if (ox) { ox.translate(160, 0); ox.scale(-1, 1); ox.drawImage(sample, 0, 0); } drawTransition(ctx, item.id, over ? t / 2 : 0.4, outgoing, layer); }
      else if (layer) ctx.drawImage(layer, 0, 0);
      if (over) raf = requestAnimationFrame(draw);
    };
    const photo = new Image(); photo.src = presetSource;
    draw(); return () => { photo.onload = null; cancelAnimationFrame(raf); };
  }, [item.id, selected, tab, height, over]);
  return <canvas ref={ref} width={160} height={90} className="aspect-video w-full bg-stage" onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)} />;
}

export function AssetBrowser({ tab, store, width, height, media, audio, captions }: { tab: LibraryTab; store: EditorStore; width: number; height: number; media: ReactNode; audio: ReactNode; captions: ReactNode }) {
  const [category, setCategory] = useState(['Effects', 'Transitions', 'Filters', 'Stickers', 'Text'].includes(tab) ? 'Trending' : CATEGORY[tab][0] ?? 'Trending');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { try { setFavorites(JSON.parse(localStorage.getItem('cutroom-favorites') ?? '[]')); } catch {} }, []);
  useEditor(store, s => s.timeline);
  const selectedId = useEditor(store, s => s.selectedClipId);
  const hit = store.findClip(selectedId), selected = hit?.clip;
  const apply = (fn: (c: Clip) => Clip, pref: string) => {
    const current = presetTarget(store);
    if (!current || current.clip.kind === 'audio') { toast.error('Select a video or overlay clip first.'); return; }
    if (current.track.locked) { toast.error('Unlock this track first.'); return; }
    const time = visiblePresetTime(store);
    store.updateClip(current.clip.id, fn); store.set({ selectedClipId: current.clip.id, time, playing: false, inspectorTab: pref });
  };
  let items: Item[] = [];
  if (tab === 'Effects') items = EFFECTS.filter(e => e.group !== 'AI portrait').map(e => ({ ...e, apply: () => apply(c => ({ ...c, fx: [...(c.fx ?? []).filter(f => f.id !== e.id), { id: e.id, intensity: 75 }] }), 'effects') }));
  if (tab === 'Filters') items = FILTERS.map(f => ({ ...f, apply: () => apply(c => ({ ...c, filter: { id: f.id, intensity: 100 } }), 'filters') }));
  if (tab === 'Transitions') items = TRANSITIONS.map(t => ({ ...t, apply: () => {
    const current = presetTarget(store);
    if (!current || current.track.locked || current.track.kind === 'audio') { toast.error('Select an unlocked video clip.'); return; }
    const target = prevAdjacent(current.track, current.clip) ? current.clip : nextAdjacent(current.track, current.clip);
    if (!target) { toast.error('Place two clips next to each other on the same track.'); return; }
    store.updateClip(target.id, c => ({ ...c, transitionIn: { type: t.id, duration: Math.min(0.8, clipDuration(c)) } }));
    store.set({ selectedClipId: target.id, time: target.start + Math.min(0.25, clipDuration(target) / 2), playing: false, inspectorTab: 'trans' });
  } }));
  if (tab === 'Text') items = TEXT_TEMPLATES.map(t => ({ id: t.id, name: t.name, group: t.anim?.loop ? 'Animation' : 'Classic', clip: clipFromTemplate(t, 0, width, height), apply: () => addClipToTimeline(store, clipFromTemplate(t, visiblePresetTime(store), width, height)) }));
  if (tab === 'Stickers') items = [...ART_STICKERS.map(e => ({ id: e.id, name: e.name, group: String(e.group), clip: shapeClip(`sticker:${e.id}`, 0, e.fill), apply: () => { const c = shapeClip(`sticker:${e.id}`, visiblePresetTime(store), e.fill); c.name = e.name; addClipToTimeline(store, c); } })), ...SHAPES.map(s => ({ id: s.id, name: s.name, group: 'Shapes', clip: shapeClip(s.id, 0), apply: () => addClipToTimeline(store, shapeClip(s.id, visiblePresetTime(store))) }))];
  const alias: Record<string, string[]> = { Classic: ['Basic', 'Retro', 'Classic', 'Icons', 'Shapes'], 'Magic cutout': ['AI portrait'], Motion: ['Party'], Movement: ['Slide', 'Camera'], Mask: ['Shape', 'Wipe'], Blur: ['Basic'], Light: ['Effects', 'Lens'], Overlay: ['Wipe', 'Shape'], 'Intro & Outro': ['Lens', 'Party'], Halloween: ['Retro', 'Distort'], 'Black Friday': ['Party', 'Classic'], 'Animal Meme': ['Animal Meme'], Icons: ['Icons'], Emoji: ['Icons'], Food: ['Classic'], 'Wild Pics': ['Nature', 'Split'] };
  const all = ['Trending', 'NEW', 'Hits', 'Add text', 'Text template', 'Stickers', 'Video effects', 'Transitions'].includes(category);
  const shown = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) && (category === 'Favorites' || category === 'Yours' ? favorites.includes(`${tab}:${i.id}`) : all || (i.group === category || (alias[category] ?? [category]).includes(i.group))));
  const toggleFavorite = (id: string) => { const key = `${tab}:${id}`; const next = favorites.includes(key) ? favorites.filter(v => v !== key) : [...favorites, key]; setFavorites(next); localStorage.setItem('cutroom-favorites', JSON.stringify(next)); };
  return <div className="flex h-full min-h-0">
    <nav aria-label={`${tab} categories`} className="w-32 shrink-0 overflow-y-auto border-r p-2">
      <Button variant="ghost" size="sm" className="mb-1 w-full justify-start gap-1 px-1 text-xs" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{tab === 'Effects' ? 'Video effects' : tab === 'Text' ? 'Text effects' : tab}</Button>
      {expanded && CATEGORY[tab].map(cat => <Button key={cat} size="sm" variant="ghost" className={cn('h-8 w-full justify-start truncate px-2 text-xs', cat === category && 'bg-accent text-primary')} onClick={() => setCategory(cat)}>{cat}</Button>)}
    </nav>
    <section aria-label={`${tab} library`} className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {items.length > 0 && <div className="relative m-3"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input aria-label={`Search ${tab}`} placeholder={`Search ${tab.toLowerCase()}`} value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 text-xs" /></div>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'AI avatar' ? <div className="space-y-3 p-6 text-sm text-muted-foreground"><UserRound className="size-10" /><h2 className="text-foreground">Talking AI avatar unavailable</h2><p>Talking-avatar generation needs a connected generation service; it cannot run entirely in this browser. No avatar is generated here.</p></div>
          : UNAVAILABLE.has(category) ? <p className="p-5 text-xs text-muted-foreground">{category} is not available. Licensed CapCut packs and unbuilt services are not included.</p>
          : tab === 'Media' ? media : tab === 'Audio' ? audio : tab === 'Captions' ? captions
          : tab === 'Adjustment' ? selected && hit && !hit.track.locked && selected.kind !== 'audio' ? <div className="space-y-4 p-4"><AdjustPanel c={selected} store={store} up={fn => store.updateClip(selected.id, fn)} /></div> : <p className="p-5 text-xs text-muted-foreground">No unlocked visual clip selected.</p>
          : <><div className="flex items-center justify-between px-3 pb-3"><span className="text-xs font-semibold">{category}</span><span className="text-[10px] text-muted-foreground">{shown.length} presets</span></div>
          {tab === 'Text' && <Button variant="secondary" size="sm" className="mx-3 mb-3" onClick={() => addClipToTimeline(store, textClip(visiblePresetTime(store)))}><Plus className="mr-1 size-3" />Add text</Button>}
          <div className="grid grid-cols-2 gap-3 px-3 pb-4 xl:grid-cols-3">{shown.map(i => <div key={i.id} className="group min-w-0"><div className="relative overflow-hidden rounded-md border border-border"><PresetPreview item={i} tab={tab} selected={selected} height={height} /><Button size="icon" variant="secondary" aria-label={`Favorite ${i.name}`} title="Favorite" className="absolute left-1 top-1 size-5" onClick={() => toggleFavorite(i.id)}><Star className={cn('size-3', favorites.includes(`${tab}:${i.id}`) && 'fill-primary text-primary')} /></Button><Button size="icon" aria-label={`Add ${i.name}`} title={`Add ${i.name}`} className="absolute bottom-1 right-1 size-6" onClick={i.apply}><Plus className="size-3.5" /></Button></div><div className="mt-1 truncate text-[11px]" title={i.name}>{i.name}</div></div>)}</div>
          {!shown.length && <p className="p-5 text-xs text-muted-foreground">No matching presets.</p>}
          {tab === 'Transitions' && selected?.transitionIn && <label className="block space-y-2 px-3 pb-4 text-xs">Duration · {selected.transitionIn.duration.toFixed(2)}s<Slider aria-label="Transition duration" min={0.1} max={Math.min(5, clipDuration(selected))} step={0.05} value={[selected.transitionIn.duration]} onValueChange={([v]) => { if (v !== undefined) apply(c => ({ ...c, transitionIn: c.transitionIn ? { ...c.transitionIn, duration: v } : undefined }), 'trans'); }} /></label>}
          </>}
      </div>
    </section>
  </div>;
}