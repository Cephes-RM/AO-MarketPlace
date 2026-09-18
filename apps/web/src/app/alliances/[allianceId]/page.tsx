import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getAllianceById } from "@albion/db";
import {
  AllianceHeader,
  GuildTable,
  PageContainer,
  Section,
  StatCard,
  StatGrid,
  fameRatio,
  formatFame,
} from "@albion/ui";

type AlliancePageProps = {
  params: Promise<{ allianceId: string }>;
};

// Shared by generateMetadata and the page so the alliance is only queried once per request.
const getAlliance = cache(getAllianceById);

export async function generateMetadata({ params }: AlliancePageProps): Promise<Metadata> {
  const { allianceId } = await params;
  const alliance = await getAlliance(allianceId);

  return { title: alliance ? `${alliance.name} · Alliance` : "Alliance not found" };
}

export default async function AlliancePage({ params }: AlliancePageProps) {
  const { allianceId } = await params;
  const alliance = await getAlliance(allianceId);

  if (!alliance) {
    notFound();
  }

  const ratio = fameRatio(alliance.killFame, alliance.deathFame);

  return (
    <PageContainer>
      <AllianceHeader
        name={alliance.name}
        guildCount={alliance.guildCount}
        memberCount={alliance.memberCount}
      />

      <StatGrid>
        <StatCard label="Guilds" value={alliance.guildCount} />
        <StatCard label="Members" value={alliance.memberCount} />
        <StatCard
          label="Kill Fame"
          value={formatFame(alliance.killFame, { compact: true })}
          hint={formatFame(alliance.killFame)}
        />
        <StatCard label="Fame Ratio" value={ratio === null ? "—" : ratio.toFixed(2)} />
      </StatGrid>

      <Section title="Member guilds">
        <GuildTable
          guilds={alliance.guilds}
          getGuildHref={(guildId) => `/guilds/${encodeURIComponent(guildId)}`}
          emptyMessage="This alliance has no guilds yet."
        />
      </Section>
    </PageContainer>
  );
}
