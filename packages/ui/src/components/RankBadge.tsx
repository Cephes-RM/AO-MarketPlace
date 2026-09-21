import { cn } from "../lib/cn";

// Gold, silver, bronze for the podium; plain iron for everyone below it.
const MEDALS = [
  "border-gold-300/60 bg-gold-500/15 text-gold-300",
  "border-neutral-300/50 bg-neutral-300/10 text-neutral-300",
  "border-amber-700/60 bg-amber-700/15 text-amber-600",
];

export interface RankBadgeProps {
  /** 1-based position in the ranking. */
  rank: number;
  className?: string;
}

/** A position number, with a medal colour for the top three. */
export function RankBadge({ rank, className }: RankBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full border font-display text-xs font-bold",
        MEDALS[rank - 1] ??
          "border-neutral-200 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400",
        className,
      )}
    >
      {rank}
    </span>
  );
}
