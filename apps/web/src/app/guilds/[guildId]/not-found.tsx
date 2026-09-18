import Link from "next/link";
import { EmptyState, PageContainer } from "@albion/ui";

export default function GuildNotFound() {
  return (
    <PageContainer>
      <EmptyState
        title="Guild not found."
        description="No guild with this ID exists in our database."
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
