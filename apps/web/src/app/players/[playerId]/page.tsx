import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { getPlayerById, getPlayerKillEvents } from "@albion/db";
import {
  Card,
  KillEventTable,
  PageContainer,
  PlayerHeader,
  Section,
  StatCard,
  StatGrid,
  TableSkeleton,
  fameRatio,
  formatFame,
} from "@albion/ui";

type PlayerPageProps = {
  params: Promise<{ playerId: string }>;
};

/**
 * getPlayerById throws for a missing or malformed id. Translate those two cases
 * into a 404 and let anything else reach the error boundary, so every profile
 * page reports failures the same way.
 */
const getPlayer = cache(async (playerId: string) => {
  try {
    return await getPlayerById(playerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message === "Player not found" || message === "Invalid player ID") {
      return null;
    }
    throw error;
  }
});

/**
 * Kill events are the slowest part of the page, so they stream in behind a
 * skeleton. The player lookup itself stays outside this boundary, otherwise a
 * missing player could no longer answer with a 404.
 */
async function KillEvents({ playerId }: { playerId: string }) {
  const killEvents = await getPlayerKillEvents(playerId);

  return (
    <KillEventTable
      events={killEvents}
      playerId={playerId}
      showEquipment
      emptyMessage="No kill events recorded for this player yet."
    />
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { playerId } = await params;
  const player = await getPlayer(playerId);

  return { title: player ? `${player.name} · Player` : "Player not found" };
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { playerId } = await params;
  const player = await getPlayer(playerId);

  if (!player) {
    notFound();
  }

  const ratio = fameRatio(player.killFame, player.deathFame);
  // A player's guild is whichever membership has not ended.
  const currentMembership = player.guildMemberships.find(
    (membership) => membership.leftAt === null,
  );
  // Newest first, so the current guild leads the history.
  const history = [...player.guildMemberships].reverse();

  return (
    <PageContainer>
      <PlayerHeader
        name={player.name}
        region={player.region}
        guildName={currentMembership?.guild.name}
        rating={player.rating}
        stars={player.stars}
        guildHref={
          currentMembership
            ? `/guilds/${encodeURIComponent(currentMembership.guildId)}`
            : undefined
        }
      />

      <StatGrid>
        <StatCard
          label="Fame"
          value={formatFame(player.fame, { compact: true })}
          hint={formatFame(player.fame)}
        />
        <StatCard
          label="Kill Fame"
          value={formatFame(player.killFame, { compact: true })}
          hint={formatFame(player.killFame)}
        />
        <StatCard
          label="Death Fame"
          value={formatFame(player.deathFame, { compact: true })}
          hint={formatFame(player.deathFame)}
        />
        <StatCard label="Fame Ratio" value={ratio === null ? "—" : ratio.toFixed(2)} />
      </StatGrid>

      <Section title="Guild history">
        {history.length === 0 ? (
          <Card className="px-6 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No guild history recorded for this player.
          </Card>
        ) : (
          <Card className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {history.map((membership) => (
              <div
                key={`${membership.guildId}-${membership.joinedAt.toISOString()}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-medium">
                  {membership.guild.name}
                  {membership.leftAt === null ? (
                    <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                      current
                    </span>
                  ) : null}
                </span>
                <span className="text-neutral-600 tabular-nums dark:text-neutral-400">
                  {DATE_FORMAT.format(membership.joinedAt)} —{" "}
                  {membership.leftAt ? DATE_FORMAT.format(membership.leftAt) : "present"}
                </span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Recent kill events">
        <Suspense fallback={<TableSkeleton rows={5} />}>
          <KillEvents playerId={playerId} />
        </Suspense>
      </Section>
    </PageContainer>
  );
}
