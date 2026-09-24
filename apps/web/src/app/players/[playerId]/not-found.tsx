import Link from "next/link";
import { EmptyState, PageContainer } from "@albion/ui";

export default function PlayerNotFound() {
  return (
    <PageContainer>
      <EmptyState
        title="Player not found."
        description="No player with this ID exists in our database."
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
