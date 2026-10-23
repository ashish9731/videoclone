import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Search, Plus, Star, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { type EditorStore, useEditor } from '@/lib/editor/store';
import { type Clip, clipDuration, defaultEffects, textClip } from '@/lib/editor/types';
import { FILTERS, EFFECTS } from '@/lib/editor/fx';
import { TRANSITIONS, drawTransition, maxTransitionDuration, prevAdjacent } from '@/lib/editor/transitions';
import { TEXT_TEMPLATES, clipFromTemplate, shapeClip } from '@/lib/editor/presets';
import { SHAPES } from '@/lib/editor/shapes';
import { renderClipLayer } from '@/lib/editor/render';
import { addClipToTimeline, presetTarget, visiblePresetTime } from '@/lib/editor/placement';
import { applyPresetAt, endAssetDrag, writePresetDrag } from './library-drag';
import { ProChip } from './ProChip';
import { isProPreset, PRO_COPY } from '@/lib/pro-gate';
import { AdjustPanel } from './Inspector';
import { cn } from '@/lib/utils';
import presetSource from '@/assets/preset-source.jpg';
import { ART_STICKERS } from '@/lib/editor/stickers';

export type LibraryTab = 'Media' | 'Audio' | 'Text' | 'Stickers' | 'Effects' | 'Transitions' | 'Captions' | 'Filters' | 'Adjustment' | 'AI avatar';
const CATEGORY: Record<LibraryTab, string[]> = {
  Media: ['Media'],
  Audio: ['Audio'],
  Text: ['Add text', 'Yours', 'Trending', 'Classic', 'Animation', 'Text template'],
  Stickers: ['Yours', 'Trending', ...new Set<string>([...ART_STICKERS.map(e => String(e.group)), 'Shapes'])],
  Effects: ['Favorites', 'Trending', 'Basic', 'Distort', 'Retro', 'Party', 'Lens', 'Split', 'Nature', ...new Set(EFFECTS.filter(e => !['Basic','Distort','Retro','Party','Lens','Split','Nature'].includes(e.group)).map(e => e.group))],
  Transitions: ['Favorites', 'Trending', ...new Set(TRANSITIONS.map(t => t.group))],
  Captions: ['Captions'],
  Filters: ['Favorites', 'Trending', ...new Set(FILTERS.map(f => f.group))],
  Adjustment: ['Color'],
  'AI avatar': ['Talking avatar'],
};
type Item = { id: string; name: string; group: string; clip?: Clip | undefined; apply: () => void };
const UNAVAILABLE = new Set(['B.Duck', 'Nailoong', 'Free Fire', 'AI packaging', 'Textile Art', 'Subprojects', 'Generate', 'Spaces', 'Library', 'Body effects', '3D', 'Magic cutout']);

/**
 * One rAF driver for the whole gallery. Tiles used to each run their own loop and
 * allocate a fresh sample canvas (plus a new Image) every pass, so opening the library
 * or adding a clip stalled the preview. Now: one loop, one shared source copy, only
 * visible tiles redraw, and edits never restart a tile.
 */
const TILE_W = 160, TILE_H = 90;
const LIVE_TABS = new Set<LibraryTab>(['Effects', 'Transitions', 'Filters', 'Stickers']);
const IDLE_MS = 130, HOVER_MS = 40, PLAYING_MS = 500;

type Tile = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; id: string; tab: LibraryTab; height: number; visible: boolean; hover: boolean; next: number };
const tiles = new Set<Tile>();
const itemRegistry = new Map<string, Item>();
let gallerySelected: Clip | undefined;
let driverRAF = 0;
let sampleCanvas: HTMLCanvasElement | null = null;
let liveCanvas: HTMLCanvasElement | null = null;
let liveSearchedAt = -1e9;
let photo: HTMLImageElement | null = null;
let tileMirror: HTMLCanvasElement | null = null;
// tiles back off completely while the timeline is playing so playback keeps full frame budget
let galleryPlaying = false;

function ensurePhoto(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!photo) {
    photo = new Image();
    photo.src = presetSource;
  }
  return photo.complete && photo.naturalWidth ? photo : null;
}

/** The 160x90 still frame every tile starts from: live footage when playing, else the preset photo. */
function gallerySource(now: number, needsLive: boolean): CanvasImageSource | null {
  if (needsLive) {
    if (!liveCanvas || now - liveSearchedAt > 500) {
      liveSearchedAt = now;
      liveCanvas = document.querySelector<HTMLCanvasElement>('canvas[data-preview]');
    }
    if (liveCanvas && liveCanvas.width > 0 && liveCanvas.height > 0) {
      const s = (sampleCanvas ??= document.createElement('canvas'));
      if (s.width !== TILE_W) { s.width = TILE_W; s.height = TILE_H; }
      const sx = s.getContext('2d');
      if (!sx) return null;
      const lr = liveCanvas.width / liveCanvas.height, tr = TILE_W / TILE_H;
      let sw = liveCanvas.width, sh = liveCanvas.height, ox = 0, oy = 0;
      if (lr > tr) { sw = liveCanvas.height * tr; ox = (liveCanvas.width - sw) / 2; } else { sh = liveCanvas.width / tr; oy = (liveCanvas.height - sh) / 2; }
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.fillStyle = '#12141a';
      sx.fillRect(0, 0, TILE_W, TILE_H);
      sx.drawImage(liveCanvas, ox, oy, sw, sh, 0, 0, TILE_W, TILE_H);
      return s;
    }
  }
  return ensurePhoto();
}

function drawTile(tile: Tile, now: number, source: CanvasImageSource) {
  const { ctx, tab, id, height } = tile;
  const item = itemRegistry.get(`${tab}:${id}`);
  if (!item) return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = tile.hover ? 1 : 0.5;
  const t = reduce ? 0.65 : (now / 1000) * speed;
  const loopT = ((t % 2) + 2) % 2;
  let c: Clip = item.clip ?? { ...textClip(0), kind: 'video', text: undefined, out: 4 };
  if (!item.clip && gallerySelected && gallerySelected.kind !== 'audio') c = { ...gallerySelected, start: 0, in: 0, out: 4, speed: 1, speedCurve: undefined, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, keyframes: {}, effects: defaultEffects(), filter: undefined, fx: undefined, anim: undefined };
  // Ramp effects (zoom in/out) are authored against the block length, so the demo block is exactly
  // one tile loop; otherwise a thumbnail would only ever show the first half of the move.
  // A Pro effect is never applied here: painting a tile through it would start the segmentation
  // model download for a preview the user cannot get, so the tile shows bare footage under its chip.
  if (tab === 'Effects') c = { ...c, start: 0, in: 0, out: 2, speed: 1, speedCurve: undefined, fx: isProPreset(tab, id) ? undefined : [{ id, intensity: 75 }] };
  if (tab === 'Filters') c = { ...c, filter: { id, intensity: 100 } };
  if (item.clip) c = { ...c, transform: { ...c.transform, x: 0, y: 0, scale: c.kind === 'shape' ? 2.6 : 1.8 } };
  ctx.clearRect(0, 0, TILE_W, TILE_H);
  const layer = renderClipLayer('thumb-layer', c, loopT, () => source, TILE_W, TILE_H, height);
  if (tab === 'Transitions') {
    const outgoing = (tileMirror ??= document.createElement('canvas'));
    if (outgoing.width !== TILE_W) { outgoing.width = TILE_W; outgoing.height = TILE_H; }
    const ox = outgoing.getContext('2d');
    if (ox) { ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, TILE_W, TILE_H); ox.translate(TILE_W, 0); ox.scale(-1, 1); ox.drawImage(source, 0, 0, TILE_W, TILE_H); }
    const p = 0.5 - 0.5 * Math.cos(loopT * Math.PI);
    drawTransition(ctx, id, p, outgoing, layer);
  } else if (tab === 'Stickers' && layer) {
    ctx.drawImage(source, 0, 0);
    ctx.drawImage(layer, 0, 0);
  } else if (layer) ctx.drawImage(layer, 0, 0);
}

function drive(now: number) {
  driverRAF = requestAnimationFrame(drive);
  if (typeof document !== 'undefined' && document.hidden) return;
  let needsLive = false;
  let due = false;
  for (const tile of tiles) {
    if (!tile.visible) continue;
    if (LIVE_TABS.has(tile.tab)) needsLive = true;
    if (now >= tile.next) due = true;
  }
  if (!due) return;
  const source = gallerySource(now, needsLive);
  if (!source) return;
  for (const tile of tiles) {
    if (!tile.visible) continue;
    if (now < tile.next) continue;
    tile.next = now + (galleryPlaying ? PLAYING_MS : tile.hover ? HOVER_MS : IDLE_MS);
    drawTile(tile, now, source);
  }
}

const PresetPreview = memo(function PresetPreview({ id, tab, height }: { id: string; tab: LibraryTab; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tileRef = useRef<Tile | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const tile: Tile = { canvas, ctx, id, tab, height, visible: false, hover: false, next: 0 };
    tileRef.current = tile;
    tiles.add(tile);
    if (!driverRAF) driverRAF = requestAnimationFrame(drive);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        tile.visible = e.isIntersecting;
        if (tile.visible) tile.next = 0;
      }
    });
    io.observe(canvas);
    return () => {
      io.disconnect();
      tiles.delete(tile);
      tileRef.current = null;
      if (!tiles.size && driverRAF) {
        cancelAnimationFrame(driverRAF);
        driverRAF = 0;
      }
    };
  }, [id, tab, height]);
  return (
    <canvas
      ref={ref}
      width={TILE_W}
      height={TILE_H}
      className="aspect-video w-full bg-stage"
      onMouseEnter={() => { if (tileRef.current) { tileRef.current.hover = true; tileRef.current.next = 0; } }}
      onMouseLeave={() => { if (tileRef.current) tileRef.current.hover = false; }}
    />
  );
});

export function AssetBrowser({ tab, store, width, height, media, audio, captions }: { tab: LibraryTab; store: EditorStore; width: number; height: number; media: ReactNode; audio: ReactNode; captions: ReactNode }) {
  const [category, setCategory] = useState(['Effects', 'Transitions', 'Filters', 'Stickers', 'Text'].includes(tab) ? 'Trending' : CATEGORY[tab][0] ?? 'Trending');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { try { setFavorites(JSON.parse(localStorage.getItem('cutroom-favorites') ?? '[]')); } catch { /* unreadable favorites list starts empty */ } }, []);
  useEditor(store, s => s.timeline);
  const playing = useEditor(store, s => s.playing);
  const selectedId = useEditor(store, s => s.selectedClipId);
  useEffect(() => { galleryPlaying = playing; }, [playing]);
  const hit = store.findClip(selectedId), selected = hit?.clip;
  /**
   * Both the "+" button and a tile drag go through one placer, so a preset behaves the same
   * however it is added. A transition attaches to the seam under the playhead; an effect or a
   * grade block lands on its own line above the lane holding the current material, never inside
   * that lane, which is also what keeps text and stickers on an overlay track of their own.
   */
  const place = (tab: LibraryTab, id: string, followLane: boolean) =>
    applyPresetAt(store, tab, id, {
      time: visiblePresetTime(store),
      trackId: followLane ? presetTarget(store)?.track.id : undefined,
      pxPerSec: store.get().pxPerSec,
      width,
      height,
    });
  let items: Item[] = [];
  if (tab === 'Effects') items = EFFECTS.map(e => ({ ...e, apply: () => { place('Effects', e.id, true); } }));
  if (tab === 'Filters') items = FILTERS.map(f => ({ ...f, apply: () => { place('Filters', f.id, true); } }));
  if (tab === 'Transitions') items = TRANSITIONS.map(t => ({ ...t, apply: () => { place('Transitions', t.id, true); } }));
  if (tab === 'Text') items = TEXT_TEMPLATES.map(t => ({ id: t.id, name: t.name, group: t.anim?.loop ? 'Animation' : 'Classic', clip: clipFromTemplate(t, 0, width, height), apply: () => { place('Text', t.id, false); } }));
  if (tab === 'Stickers') items = [...ART_STICKERS.map(e => ({ id: e.id, name: e.name, group: String(e.group), clip: shapeClip(`sticker:${e.id}`, 0, e.fill), apply: () => { place('Stickers', e.id, false); } })), ...SHAPES.map(s => ({ id: s.id, name: s.name, group: 'Shapes', clip: shapeClip(s.id, 0), apply: () => { place('Stickers', s.id, false); } }))];
  const alias: Record<string, string[]> = { Classic: ['Basic', 'Retro', 'Classic', 'Icons', 'Shapes'], 'Magic cutout': ['AI portrait'], Mask: ['Shape', 'Wipe'], Blur: ['Basic'], Light: ['Effects', 'Lens'], Overlay: ['Wipe', 'Shape'], 'Intro & Outro': ['Lens', 'Party'], Halloween: ['Retro', 'Distort'], 'Black Friday': ['Party', 'Classic'], 'Animal Meme': ['Animal Meme'], Icons: ['Icons'], Emoji: ['Icons'], Food: ['Classic'], 'Wild Pics': ['Nature', 'Split'] };
  const all = ['Trending', 'NEW', 'Hits', 'Add text', 'Text template', 'Stickers', 'Video effects', 'Transitions'].includes(category);
  const shown = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) && (category === 'Favorites' || category === 'Yours' ? favorites.includes(`${tab}:${i.id}`) : all || (i.group === category || (alias[category] ?? [category]).includes(i.group))));
  // Tiles read their clip and the selected clip from here, so editing the timeline never
  // restarts a tile loop; ids are stable catalog ids, so the map stays small.
  gallerySelected = selected;
  for (const i of shown) itemRegistry.set(`${tab}:${i.id}`, i);
  const toggleFavorite = (id: string) => { const key = `${tab}:${id}`; const next = favorites.includes(key) ? favorites.filter(v => v !== key) : [...favorites, key]; setFavorites(next); localStorage.setItem('cutroom-favorites', JSON.stringify(next)); };
  return <div className="flex h-full min-h-0">
    <nav aria-label={`${tab} categories`} className="w-32 shrink-0 overflow-y-auto border-r p-2">
      <Button variant="ghost" size="sm" className="mb-1 w-full justify-start gap-1 px-1 text-xs" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{tab === 'Effects' ? 'Video effects' : tab === 'Text' ? 'Text effects' : tab}</Button>
      {expanded && CATEGORY[tab].map(cat => <Button key={cat} size="sm" variant="ghost" className={cn('h-8 w-full justify-start truncate px-2 text-xs', cat === category && 'bg-accent text-primary')} onClick={() => setCategory(cat)}>{cat}</Button>)}
    </nav>
    <section aria-label={`${tab} library`} className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {items.length > 0 && <div className="relative m-3"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input aria-label={`Search ${tab}`} placeholder={`Search ${tab.toLowerCase()}`} value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 text-xs" /></div>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'AI avatar' ? <div className="space-y-3 p-6 text-sm text-muted-foreground"><UserRound className="size-10" /><h2 className="flex items-center gap-2 text-foreground">{PRO_COPY.aiAvatar.title}<ProChip /></h2><p>{PRO_COPY.aiAvatar.body}</p></div>
          : UNAVAILABLE.has(category) ? <p className="p-5 text-xs text-muted-foreground">{category} is not available. Stock libraries and bundled third-party packs are not included.</p>
          : tab === 'Media' ? media : tab === 'Audio' ? audio : tab === 'Captions' ? captions
          : tab === 'Adjustment' ? selected && hit && !hit.track.locked && selected.kind !== 'audio' ? <div className="space-y-4 p-4"><AdjustPanel c={selected} store={store} up={fn => store.updateClip(selected.id, fn)} /></div> : <p className="p-5 text-xs text-muted-foreground">No unlocked visual clip selected.</p>
          : <><div className="flex items-center justify-between px-3 pb-3"><span className="text-xs font-semibold">{category}</span><span className="text-[10px] text-muted-foreground">{shown.length} presets</span></div>
          {tab === 'Text' && <Button variant="secondary" size="sm" className="mx-3 mb-3" onClick={() => addClipToTimeline(store, textClip(visiblePresetTime(store)))}><Plus className="mr-1 size-3" />Add text</Button>}
          <div className="grid grid-cols-2 gap-3 px-3 pb-4 xl:grid-cols-3">{shown.map(i => { const locked = isProPreset(tab, i.id); return <div key={i.id} className="group min-w-0" draggable title={locked ? `${i.name} - ${PRO_COPY.aiPortrait.title}` : `${i.name} - click to add or drag onto the timeline`} onDragStart={e => writePresetDrag(e, tab, i.id)} onDragEnd={endAssetDrag}><div className="relative overflow-hidden rounded-md border border-border cursor-grab active:cursor-grabbing"><PresetPreview id={i.id} tab={tab} height={height} />{locked && <ProChip className="absolute right-1 top-1" title={PRO_COPY.aiPortrait.title} />}<Button size="icon" variant="secondary" aria-label={`Favorite ${i.name}`} title="Favorite" className="absolute left-1 top-1 size-5" onClick={() => toggleFavorite(i.id)}><Star className={cn('size-3', favorites.includes(`${tab}:${i.id}`) && 'fill-primary text-primary')} /></Button><Button size="icon" aria-label={`Add ${i.name}`} title={`Add ${i.name}`} className="absolute bottom-1 right-1 size-6" onClick={i.apply}><Plus className="size-3.5" /></Button></div><div className="mt-1 truncate text-[11px]" title={i.name}>{i.name}</div></div>; })}</div>
          {!shown.length && <p className="p-5 text-xs text-muted-foreground">No matching presets.</p>}
          {tab === 'Transitions' && selected?.transitionIn && hit && !hit.track.locked && <label className="block space-y-2 px-3 pb-4 text-xs">Duration · {selected.transitionIn.duration.toFixed(2)}s<Slider aria-label="Transition duration" min={0.1} max={maxTransitionDuration(prevAdjacent(hit.track, selected), selected)} step={0.05} value={[Math.min(selected.transitionIn.duration, maxTransitionDuration(prevAdjacent(hit.track, selected), selected))]} onValueChange={([v]) => { if (v !== undefined) store.updateClip(selected.id, c => ({ ...c, transitionIn: c.transitionIn ? { ...c.transitionIn, duration: v } : undefined })); }} /></label>}
          </>}
      </div>
    </section>
  </div>;
}