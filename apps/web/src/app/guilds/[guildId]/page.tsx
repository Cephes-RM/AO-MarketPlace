import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getGuildById } from "@albion/db";
import {
  GuildHeader,
  PageContainer,
  PlayerTable,
  Section,
  StatCard,
  StatGrid,
  fameRatio,
  formatFame,
} from "@albion/ui";

type GuildPageProps = {
  params: Promise<{ guildId: string }>;
};

// Shared by generateMetadata and the page so the guild is only queried once per request.
const getGuild = cache(getGuildById);

export async function generateMetadata({ params }: GuildPageProps): Promise<Metadata> {
  const { guildId } = await params;
  const guild = await getGuild(guildId);

  return { title: guild ? `${guild.name} · Guild` : "Guild not found" };
}

export default async function GuildPage({ params }: GuildPageProps) {
  const { guildId } = await params;
  const guild = await getGuild(guildId);

  if (!guild) {
    notFound();
  }

  const ratio = fameRatio(guild.killFame, guild.deathFame);

  return (
    <PageContainer>
      <GuildHeader
        name={guild.name}
        memberCount={guild.memberCount}
        allianceName={guild.alliance?.name}
        allianceHref={
          guild.alliance ? `/alliances/${encodeURIComponent(guild.alliance.id)}` : undefined
        }
      />

      <StatGrid>
        <StatCard label="Members" value={guild.memberCount} />
        <StatCard
          label="Kill Fame"
          value={formatFame(guild.killFame, { compact: true })}
          hint={formatFame(guild.killFame)}
        />
        <StatCard
          label="Death Fame"
          value={formatFame(guild.deathFame, { compact: true })}
          hint={formatFame(guild.deathFame)}
        />
        <StatCard label="Fame Ratio" value={ratio === null ? "—" : ratio.toFixed(2)} />
      </StatGrid>

      <Section title="Members">
        <PlayerTable
          players={guild.members}
          emptyMessage="No tracked members in this guild yet."
        />
      </Section>
    </PageContainer>
  );
}
