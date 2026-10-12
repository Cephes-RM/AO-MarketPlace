import { getPlayerById } from "@albion/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CombatEventCard,
  EmptyState,
  ErrorState,
  formatFame,
  fameRatio,
  PageContainer,
  ProfileHeading,
  SectionHeading,
  StatCard,
} from "@albion/ui";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  try {
    const player = await getPlayerById(playerId);
    const currentMembership = player.guildMemberships.find(
      (membership) => membership.leftAt === null,
    );

    return (
      <PageContainer>
        <div className="breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>Player</span></div>
        <ProfileHeading eyebrow="PLAYER PROFILE" title={player.name} />
        <div className="stats-grid stats-grid--profile">
          <StatCard label="Current guild" value={currentMembership?.guild.name ?? "Independent"} />
          <StatCard label="Fame" value={formatFame(player.fame)} />
          <StatCard label="Rating" value={player.rating.toLocaleString("en")} />
          <StatCard label="Kill fame" value={formatFame(player.killFame)} />
          <StatCard label="Death fame" value={formatFame(player.deathFame)} />
          <StatCard label="Kill / death fame" value={fameRatio(player.killFame, player.deathFame)} />
          <StatCard label="Stars" value={player.stars} />
        </div>
        <nav className="profile-nav" aria-label="Player sections">
          <a href="#recent-kills">Recent kills</a>
          <a href="#recent-deaths">Recent deaths</a>
          <a href="#guild-history">Guild history</a>
        </nav>
        <section className="directory-section" id="recent-kills">
          <SectionHeading title="Recent kills" description="The latest 20 recorded kills, newest first." />
          {player.kills.length ? (
            <div className="combat-list">
              {player.kills.map((event) => <CombatEventCard key={event.id} event={event} kind="kill" />)}
            </div>
          ) : (
            <EmptyState title="No recent kills">No kills have been recorded for this player yet.</EmptyState>
          )}
        </section>
        <section className="directory-section" id="recent-deaths">
          <SectionHeading title="Recent deaths" description="The latest 20 recorded deaths, newest first." />
          {player.deaths.length ? (
            <div className="combat-list">
              {player.deaths.map((event) => <CombatEventCard key={event.id} event={event} kind="death" />)}
            </div>
          ) : (
            <EmptyState title="No recent deaths">No deaths have been recorded for this player yet.</EmptyState>
          )}
        </section>
        <section className="directory-section" id="guild-history">
          <SectionHeading title="Guild history" description="Recorded guild memberships for this player." />
          {player.guildMemberships.length === 0 ? (
            <EmptyState title="No guild history">This player has no recorded guild memberships.</EmptyState>
          ) : (
            <div className="directory-list">
              {player.guildMemberships.map((membership) => (
                <Link className="directory-row" href={`/guilds/${encodeURIComponent(membership.guildId)}`} key={`${membership.playerId}-${membership.guildId}-${membership.joinedAt.toISOString()}`}>
                  <span className="directory-row__rank">{membership.leftAt === null ? "NOW" : "GUILD"}</span>
                  <span className="directory-row__main"><strong>{membership.guild.name}</strong><span>{membership.joinedAt.toLocaleDateString()} — {membership.leftAt?.toLocaleDateString() ?? "Present"}</span></span>
                  <span className="directory-row__score">{membership.guild.alliance?.name ?? "Independent"}</span>
                  <span className="directory-row__arrow" aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </PageContainer>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message === "Player not found") {
      notFound();
    }

    if (message === "Invalid player ID") {
      return <PageContainer><ErrorState title="Invalid player ID">Check the profile link and try again.</ErrorState></PageContainer>;
    }

    return <PageContainer><ErrorState /></PageContainer>;
  }
}
