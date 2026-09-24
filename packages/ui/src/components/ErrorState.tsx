import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** A retry button or a link back, rendered under the message. */
  action?: ReactNode;
  /** Shown in small print, e.g. Next's error digest. */
  reference?: string | null;
  className?: string;
}

/**
 * The standard "something went wrong" panel.
 * Pairs with EmptyState so a failure and an empty result look related
 * rather than like two different applications.
 */
export function ErrorState({
  title = "Something went wrong.",
  description = "This page could not be loaded. Please try again.",
  action,
  reference,
  className,
}: ErrorStateProps) {
  return (
    <EmptyState
      title={title}
      description={
        <>
          {description}
          {reference ? (
            <span className="mt-2 block font-mono text-xs text-neutral-400 dark:text-neutral-500">
              Reference: {reference}
            </span>
          ) : null}
        </>
      }
      action={action}
      className={className}
    />
  );
}
