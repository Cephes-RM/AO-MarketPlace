import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Card } from "./Card";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Message shown when there is nothing to display or something failed to load. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", className)}>
      <p className="text-base font-semibold">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}
