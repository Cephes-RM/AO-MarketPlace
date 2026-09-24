import { cn } from "../lib/cn";

export interface StarRatingProps {
  value: number;
  max?: number;
  className?: string;
}

/** Read-only star display; the value is clamped to 0..max. */
export function StarRating({ value, max = 5, className }: StarRatingProps) {
  const filled = Math.max(0, Math.min(max, Math.round(value)));

  return (
    <span
      role="img"
      aria-label={`${filled} out of ${max} stars`}
      className={cn("inline-flex gap-0.5", className)}
    >
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cn(
            "size-4",
            i < filled ? "fill-amber-400" : "fill-neutral-300 dark:fill-neutral-700",
          )}
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}
