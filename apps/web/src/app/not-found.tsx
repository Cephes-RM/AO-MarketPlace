import Link from "next/link";
import { EmptyState, PageContainer } from "@albion/ui";

/** Shown for any URL that matches no route. */
export default function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        title="Page not found."
        description="This page does not exist."
        action={
          <Link
            href="/"
            className="text-sm font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            Back to home
          </Link>
        }
      />
    </PageContainer>
  );
}
