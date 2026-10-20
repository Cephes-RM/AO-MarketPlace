import { EmptyState } from "@albion/ui";
import { PageRecovery } from "@/components/page-recovery";

export default function NotFound() {
  return (
    <PageRecovery
      eyebrow="404 · PAGE NOT FOUND"
      title="This path leads nowhere."
      description="We couldn't find the page or profile you requested."
    >
      <EmptyState title="Check the link or search again">
        The address may be incorrect, or the profile may not be in the directory yet.
      </EmptyState>
    </PageRecovery>
  );
}
