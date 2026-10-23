import { PRO_BADGE } from "@/lib/pro-gate";
import { cn } from "@/lib/utils";

interface Props {
  className?: string | undefined;
  title?: string | undefined;
}

/**
 * Marks a control the free editor does not actually run. Every gated surface - the caption buttons,
 * an effect tile, the avatar tab - shows this one chip, so a locked feature never looks like a broken
 * one, and the notice raised on click comes from the same `pro-gate` copy.
 */
export function ProChip({ className, title }: Props) {
  return (
    <span
      className={cn(
        "rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase leading-none tracking-widest text-primary",
        className,
      )}
      title={title}
    >
      {PRO_BADGE}
    </span>
  );
}
