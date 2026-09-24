"use client";

import { useEffect } from "react";
import { ErrorState, PageContainer } from "@albion/ui";

/**
 * The app-wide error boundary. Any page that throws lands here, so an
 * unexpected failure looks the same on the player, guild and alliance pages.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <ErrorState
        reference={error.digest ?? null}
        action={
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Try again
          </button>
        }
      />
    </PageContainer>
  );
}
