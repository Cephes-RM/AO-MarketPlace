import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** The page frame every route uses, so widths and spacing never drift apart. */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main className={cn("mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10", className)}>
      {children}
    </main>
  );
}

export interface SectionProps {
  title?: string;
  /** Shown on the right of the title, e.g. a link or a count. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled block of page content. */
export function Section({ title, action, children, className }: SectionProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title || action ? (
        <div className="flex items-center justify-between gap-3">
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface StatGridProps {
  children: ReactNode;
  className?: string;
}

/** The row of StatCards used at the top of every profile page. */
export function StatGrid({ children, className }: StatGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-4", className)}>{children}</div>
  );
}
