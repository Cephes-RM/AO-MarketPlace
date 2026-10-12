import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllianceById } from "@albion/db";
import {
  EmptyState,
  ErrorState,
  PageContainer,
  ProfileHeading,
  SectionHeading,
  StatCard,
} from "@albion/ui";

type Props = { params: Promise<{ allianceId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { allianceId } = await params;
  try {
    const alliance = await getAllianceById(allianceId);
    return {
      title: `${alliance.name} Alliance`,
      description: `Explore ${alliance.name}, its guilds, and community details on Albion Market.`,
    };
  } catch {
    return { title: "Alliance not found" };
  }
}

export default async function AlliancePage({ params }: Props) {
  const { allianceId } = await params;
  let alliance: Awaited<ReturnType<typeof getAllianceById>>;

  try {
    alliance = await getAllianceById(allianceId);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Alliance not found" || error.message === "Invalid alliance ID")
    ) {
      notFound();
    }
    return (
      <PageContainer>
        <ErrorState title="Alliance details are unavailable">
          We couldn’t load this alliance. Please try again in a moment.
        </ErrorState>
      </PageContainer>
    );
  }

  const memberCount = alliance.guilds.reduce((sum, guild) => sum + guild._count.memberships, 0);

  return (
    <PageContainer>
      <div className="breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Alliance</span></div>
      <ProfileHeading
        eyebrow="ALLIANCE PROFILE"
        title={alliance.name}
        description="The guilds that stand together under this alliance."
      />
      <div className="stats-grid stats-grid--profile">
        <StatCard label="Guilds" value={alliance.guilds.length} />
        <StatCard label="Current guild members" value={memberCount.toLocaleString("en")} />
        <StatCard label="Alliance ID" value={<span className="id-value">{alliance.id}</span>} />
      </div>
      <section className="directory-section">
        <SectionHeading
          title="Member guilds"
          description="Guilds currently associated with this alliance in the directory."
        />
        {alliance.guilds.length ? (
          <div className="directory-list">
            {alliance.guilds.map((guild, index) => (
              <Link className="directory-row" href={`/guilds/${encodeURIComponent(guild.id)}`} key={guild.id}>
                <span className="directory-row__rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="directory-row__main"><strong>{guild.name}</strong><span>Guild profile</span></span>
                <span className="directory-row__score">{guild._count.memberships.toLocaleString("en")} <small>members</small></span>
                <span className="directory-row__arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No guilds listed yet">
            Guilds will appear here when they are associated with this alliance.
          </EmptyState>
        )}
      </section>
    </PageContainer>
  );
}
