import { useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Clip } from '@/lib/editor/types';
import { type EditorStore } from '@/lib/editor/store';
import { volumeFromLine } from '@/lib/editor/clip-controls';

export function AudioClipVolume({ clip, store, locked }: { clip: Clip; store: EditorStore; locked: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  const level = clip.muted ? 0 : clip.volume;
  return <div ref={area} className="absolute inset-x-2 bottom-1 top-5" onPointerDown={e => e.stopPropagation()}>
    <div
      role="slider" tabIndex={locked ? -1 : 0} aria-label={`Volume for ${clip.name}`}
      aria-valuemin={0} aria-valuemax={200} aria-valuenow={Math.round(level * 100)} aria-valuetext={`${Math.round(level * 100)}%`}
      aria-disabled={locked} title="Drag up or down to change this clip’s volume"
      className="absolute inset-x-0 z-10 flex h-5 -translate-y-1/2 cursor-ns-resize touch-none items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      style={{ top: `${(1 - Math.min(2, level) / 2) * 100}%` }}
      onPointerDown={e => {
        e.stopPropagation(); e.preventDefault();
        const bounds = area.current?.getBoundingClientRect();
        if (locked || !bounds || bounds.height <= 0) return;
        const target = e.currentTarget;
        const startY = e.clientY, initial = clip.volume;
        store.beginGesture(); store.set({ selectedClipId: clip.id });
        target.setPointerCapture(e.pointerId);
        const move = (event: PointerEvent) => {
          const fraction = 1 - initial / 2 + (event.clientY - startY) / bounds.height;
          store.updateClip(clip.id, c => ({ ...c, volume: volumeFromLine(fraction), muted: false }));
        };
        const end = () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', end);
          target.removeEventListener('pointercancel', end);
          store.endGesture();
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', end);
        target.addEventListener('pointercancel', end);
      }}
      onKeyDown={e => {
        e.stopPropagation();
        if (locked) return;
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : e.key === 'ArrowUp' || e.key === 'ArrowRight' ? clip.volume + .05 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? clip.volume - .05 : null;
        if (next === null) return;
        e.preventDefault();
        store.updateClip(clip.id, c => ({ ...c, volume: Math.max(0, Math.min(2, next)), muted: false }));
      }}
    ><span className="h-0.5 w-full bg-foreground" /><span className="absolute right-0 rounded bg-background px-1 font-mono text-[10px] text-foreground">{Math.round(level * 100)}%</span></div>
    <Button size="icon" variant="ghost" disabled={locked} className="absolute bottom-0 left-0 z-20 h-5 w-5 bg-background/70" aria-label={`${clip.muted ? 'Unmute' : 'Mute'} clip ${clip.name}`} title={clip.muted ? 'Unmute this clip' : 'Mute this clip'} onClick={e => {
      e.stopPropagation(); store.set({ selectedClipId: clip.id }); store.updateClip(clip.id, c => ({ ...c, muted: !c.muted }));
    }}>{clip.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</Button>
  </div>;
}