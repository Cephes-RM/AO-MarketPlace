import type { ReactNode } from "react";
import Link from "next/link";
import {
  PageContainer,
  ProfileHeading,
  SectionHeading,
  SiteSearch,
} from "@albion/ui";

type PageRecoveryProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function PageRecovery({
  eyebrow,
  title,
  description,
  children,
  actions,
}: PageRecoveryProps) {
  return (
    <PageContainer>
      <section className="recovery-page">
        <ProfileHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />
        {children}
        <div className="recovery-page__actions">
          {actions}
          <Link className="button recovery-page__home" href="/">
            Back to home
          </Link>
        </div>
        <section className="recovery-page__search" aria-label="Find another profile">
          <SectionHeading
            title="Find your next destination"
            description="Search for a player, guild, or alliance by name."
          />
          <SiteSearch />
        </section>
      </section>
    </PageContainer>
  );
}
