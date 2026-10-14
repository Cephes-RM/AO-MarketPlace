import type { Metadata } from "next";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  ProfileHeading,
  SectionHeading,
  StatCard,
} from "@albion/ui";
import { TokenCatalogue } from "./token-catalogue";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "UI design tokens",
  description: "Shared Albion Market colors, typography, spacing, and borders.",
  robots: { index: false, follow: false },
};

export default function UiReferencePage() {
  return (
    <PageContainer>
      <div className="breadcrumb"><a href="/">Home</a><span>/</span><span>UI reference</span></div>
      <ProfileHeading
        eyebrow="DEVELOPER REFERENCE"
        title="Design tokens"
        description="One shared source for the colors, type, spacing, and borders used throughout Albion Market."
      />
      <p className={styles.intro}>
        Values are defined in <code>@albion/ui/tokens.css</code> and imported once
        by the web layout. Use <code>var(--token-name)</code> in component styles.
        The existing visual values are preserved, including the smaller text and
        irregular spacing steps; changing those values is a separate design decision.
      </p>
      <TokenCatalogue />
      <section className={styles.section} id="examples" aria-labelledby="examples-heading">
        <div id="examples-heading">
          <SectionHeading title="Shared component examples" description="Static examples of the tokens in use, without live directory data." />
        </div>
        <div className={styles.examples}>
          <StatCard label="Example statistic" value="1,234" />
          <EmptyState title="Example empty state">Directory records appear here when available.</EmptyState>
          <ErrorState title="Example error state">This is a visual example, not an active service error.</ErrorState>
          <LoadingState label="Example loading state" />
        </div>
      </section>
    </PageContainer>
  );
}
