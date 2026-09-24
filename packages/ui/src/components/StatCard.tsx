import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Card } from "./Card";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Secondary line under the value, e.g. the exact number behind a compact one. */
  hint?: ReactNode;
  className?: string;
}

/** A single labelled metric. */
export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-xs text-neutral-500 tabular-nums dark:text-neutral-400">{hint}</p>
      ) : null}
    </Card>
  );
}
