"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@albion/ui";
import { PageRecovery } from "@/components/page-recovery";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <PageRecovery
      eyebrow="DIRECTORY UNAVAILABLE"
      title="Something went wrong."
      description="This page couldn't be loaded right now."
      actions={
        <button
          className="button button--primary recovery-page__retry"
          type="button"
          onClick={retry}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? "Trying again…" : "Try again"}
        </button>
      }
    >
      <ErrorState title="You can try again">
        The problem may be temporary. Retry this page, return home, or search for
        another profile below.
      </ErrorState>
    </PageRecovery>
  );
}
