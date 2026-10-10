import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuildById } from "@albion/db";
import {
  EmptyState,
  ErrorState,
  PageContainer,
  ProfileHeading,
  SectionHeading,
  StatCard,
} from "@albion/ui";

type Props = { params: Promise<{ guildId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guildId } = await params;
  try {
    const guild = await getGuildById(guildId);
    return {
      title: `${guild.name} Guild`,
      description: `Explore ${guild.name}, its members, and alliance on Albion Market.`,
    };
  } catch {
    return { title: "Guild not found" };
  }
}

export default async function GuildPage({ params }: Props) {
  const { guildId } = await params;
  let guild: Awaited<ReturnType<typeof getGuildById>>;

  try {
    guild = await getGuildById(guildId);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Guild not found" || error.message === "Invalid guild ID")
    ) {
      notFound();
    }
    return <PageContainer><ErrorState title="Guild details are unavailable" /></PageContainer>;
  }

  return (
    <PageContainer>
      <div className="breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Guild</span></div>
      <ProfileHeading
        eyebrow="GUILD PROFILE"
        title={guild.name}
        description={guild.alliance ? `Member of the ${guild.alliance.name} alliance.` : "An independent guild in the Albion Market directory."}
      />
      <div className="stats-grid stats-grid--profile">
        <StatCard label="Current members" value={guild.memberships.length.toLocaleString("en")} />
        <StatCard
          label="Alliance"
          value={guild.alliance ? <Link href={`/alliances/${encodeURIComponent(guild.alliance.id)}`}>{guild.alliance.name}</Link> : "Independent"}
        />
        <StatCard label="Guild ID" value={<span className="id-value">{guild.id}</span>} />
      </div>
      <section className="directory-section">
        <SectionHeading title="Guild members" description="Players currently recorded in this guild." />
        {guild.memberships.length ? (
          <div className="directory-list">
            {guild.memberships.map(({ player }) => (
              <Link className="directory-row" href={`/players/${encodeURIComponent(player.id)}`} key={player.id}>
                <span className="directory-row__rank">PLAYER</span>
                <span className="directory-row__main"><strong>{player.name}</strong><span>{player.rating.toLocaleString("en")} rating</span></span>
                <span className="directory-row__score">{player.fame.toLocaleString("en")} <small>fame</small></span>
                <span className="directory-row__arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No members listed yet">Current members will appear here when guild data is available.</EmptyState>
        )}
      </section>
    </PageContainer>
  );
}
