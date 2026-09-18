import { notFound } from "next/navigation";
import {
  AllianceHeader,
  Badge,
  EmptyState,
  ErrorState,
  EquipmentLoadout,
  GuildHeader,
  GuildTable,
  KillEventTable,
  PageContainer,
  PlayerHeader,
  PlayerTable,
  ProfileSkeleton,
  TableSkeleton,
  Section,
  StarRating,
  StatCard,
  StatGrid,
  type GuildRow,
  type KillEventRow,
  type PlayerRow,
} from "@albion/ui";

// Development-only showcase for @albion/ui components, rendered with sample data
// so they can be reviewed without a database connection.
const SAMPLE_EVENTS: KillEventRow[] = [
  {
    id: "1",
    killer: { id: "sample-player", name: "Sample Player" },
    victim: { id: "other-1", name: "Ravenclaw" },
    location: "Fort Sterling Portal",
    totalFame: "1284500",
    occurredAt: "2026-09-14T18:32:00Z",
  },
  {
    id: "2",
    killer: { id: "other-2", name: "IronMaiden" },
    victim: { id: "sample-player", name: "Sample Player" },
    location: "Black Zone — Deadpine Forest",
    totalFame: "93100",
    occurredAt: "2026-09-13T21:05:00Z",
  },
];

const SAMPLE_GUILDS: GuildRow[] = [
  {
    id: "guild-1",
    name: "Knights of Caerleon",
    memberCount: 42,
    killFame: "812004533",
    deathFame: "310442100",
  },
  { id: "guild-2", name: "Ruthless Reign", memberCount: 17, killFame: "96001220", deathFame: "0" },
];

const SAMPLE_MEMBERS: PlayerRow[] = [
  { id: "p-1", name: "Sample Player", rating: 1432, stars: 4, killFame: "12604211", deathFame: "3088450" },
  { id: "p-2", name: "Ravenclaw", rating: 980, stars: 3, killFame: "5401220", deathFame: "0" },
];

export default function UiPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PageContainer className="gap-8">
      <PlayerHeader
        name="Sample Player"
        region="europe"
        guildName="Knights of Caerleon"
        alliance="KOC"
        rating={1432}
        stars={4}
        guildHref="/guilds/guild-1"
      />

      <StatGrid>
        <StatCard label="Fame" value="48.2M" hint="48,213,904" />
        <StatCard label="Kill Fame" value="12.6M" hint="12,604,211" />
        <StatCard label="Death Fame" value="3.1M" hint="3,088,450" />
        <StatCard label="Fame Ratio" value="4.08" />
      </StatGrid>

      <Section title="Recent kill events">
        <KillEventTable events={SAMPLE_EVENTS} playerId="sample-player" />
        <KillEventTable events={[]} />
      </Section>

      <Section title="Equipment">
        <div className="flex flex-wrap gap-10">
          <EquipmentLoadout
            label="Full loadout"
            items={[
              { slot: "mainHand", itemType: "T8_MAIN_HOLYSTAFF@3", quality: 4 },
              { slot: "head", itemType: "T8_HEAD_CLOTH_SET3@2", quality: 3 },
              { slot: "armor", itemType: "T8_ARMOR_CLOTH_SET3@3", quality: 4 },
              { slot: "potion", itemType: "T7_POTION_HEAL", count: 3 },
            ]}
          />
          <EquipmentLoadout label="Nothing recorded" items={[]} />
        </div>
      </Section>

      <section className="flex flex-wrap items-center gap-3">
        <Badge>EUROPE</Badge>
        <Badge tone="gold">Top 100</Badge>
        <Badge tone="success">Kill</Badge>
        <Badge tone="danger">Death</Badge>
        <StarRating value={2} />
      </section>

      <Section title="Alliance and guild">
        <AllianceHeader name="Bozy Smallec" guildCount={2} memberCount={59} />
        <GuildTable guilds={SAMPLE_GUILDS} getGuildHref={(id) => `/guilds/${id}`} />
        <GuildHeader
          name="Knights of Caerleon"
          memberCount={42}
          allianceName="Bozy Smallec"
          allianceHref="/alliances/alliance-1"
        />
        <PlayerTable players={SAMPLE_MEMBERS} />
      </Section>

      <Section title="Loading state">
        <ProfileSkeleton rows={2} />
        <TableSkeleton rows={3} />
      </Section>

      <Section title="Empty and error states">
        <EmptyState
          title="Player not found."
          description="No player with this ID exists in our database."
        />
        <ErrorState reference="a1b2c3d4" />
      </Section>
    </PageContainer>
  );
}
