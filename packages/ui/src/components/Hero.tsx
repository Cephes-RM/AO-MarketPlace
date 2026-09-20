import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface HeroProps {
  title: ReactNode;
  tagline?: ReactNode;
  /** A short line above the title, e.g. a product name or status. */
  eyebrow?: ReactNode;
  /** Buttons or links under the tagline. */
  actions?: ReactNode;
  className?: string;
}

/** Large introduction block for the top of a page. */
export function Hero({ title, tagline, eyebrow, actions, className }: HeroProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-gradient-to-b from-amber-50 to-white px-6 py-14 text-center dark:border-neutral-800 dark:from-amber-500/10 dark:to-neutral-950",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase dark:text-amber-400">
          {eyebrow}
        </p>
      ) : null}

      <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        {title}
      </h1>

      {tagline ? (
        <p className="max-w-xl text-base text-pretty text-neutral-600 dark:text-neutral-400">
          {tagline}
        </p>
      ) : null}

      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </section>
  );
}
