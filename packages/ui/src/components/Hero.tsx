import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface HeroProps {
  title: ReactNode;
  tagline?: ReactNode;
  /** A short line above the title, e.g. a product name or status. */
  eyebrow?: ReactNode;
  /** Shown above the eyebrow, e.g. a crest or logo. */
  emblem?: ReactNode;
  /** Buttons or links under the tagline. */
  actions?: ReactNode;
  /** Rendered behind the content, e.g. an <Image fill /> backdrop. */
  backdrop?: ReactNode;
  /** Rendered under the actions, inside the banner. */
  footer?: ReactNode;
  className?: string;
}

/**
 * The banner at the top of a page: an image backdrop, darkened so text stays
 * readable, with a gold rule top and bottom like a forged plate.
 * Always dark, whatever the page theme around it.
 */
export function Hero({
  title,
  tagline,
  eyebrow,
  emblem,
  actions,
  backdrop,
  footer,
  className,
}: HeroProps) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-gold-500/30 bg-iron-950",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_18px_50px_-18px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      {backdrop ? <div className="absolute inset-0 -z-10">{backdrop}</div> : null}

      {/* darkening so any backdrop keeps the text readable */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-iron-950/85 via-iron-950/70 to-iron-950/95"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent"
      />

      <div className="flex flex-col items-center gap-5 px-6 py-16 text-center sm:py-20">
        {emblem}

        {eyebrow ? (
          <p className="font-display text-xs font-semibold tracking-[0.35em] text-gold-300/90 uppercase">
            {eyebrow}
          </p>
        ) : null}

        <h1 className="max-w-3xl font-display text-4xl font-black text-balance text-transparent drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-6xl bg-gradient-to-b from-gold-100 via-gold-300 to-gold-700 bg-clip-text">
          {title}
        </h1>

        {tagline ? (
          <p className="max-w-xl text-base text-pretty text-neutral-300">{tagline}</p>
        ) : null}

        {actions ? <div className="mt-2 flex flex-wrap justify-center gap-3">{actions}</div> : null}

        {footer ? <div className="mt-6 w-full">{footer}</div> : null}
      </div>
    </section>
  );
}
