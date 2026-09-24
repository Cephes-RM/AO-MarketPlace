import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface ProfileHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Shown next to the title, typically a Badge. */
  badge?: ReactNode;
  /** Shown on the right, e.g. a rating or a star display. */
  aside?: ReactNode;
  /** Players are round; guilds and alliances are square. */
  shape?: "circle" | "square";
  className?: string;
}

/**
 * The identity block every profile page starts with.
 * PlayerHeader, GuildHeader and AllianceHeader all build on this, so the three
 * pages stay visually identical as they change.
 */
export function ProfileHeader({
  title,
  subtitle,
  badge,
  aside,
  shape = "circle",
  className,
}: ProfileHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-center gap-4", className)}>
      <div
        aria-hidden="true"
        className={cn(
          "flex size-14 shrink-0 items-center justify-center bg-amber-100 text-xl font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
          shape === "circle" ? "rounded-full" : "rounded-xl",
        )}
      >
        {title.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-2xl font-semibold">{title}</h1>
          {badge}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
        ) : null}
      </div>

      {aside ? <div className="flex flex-col items-end gap-1">{aside}</div> : null}
    </header>
  );
}
