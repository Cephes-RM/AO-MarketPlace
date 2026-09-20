import Link from "next/link";
import { getPlatformSummary } from "@albion/db";
import {
  GuildTable,
  Hero,
  PageContainer,
  PlayerTable,
  Section,
  StatCard,
  StatGrid,
} from "@albion/ui";

// The counts and leaderboard are read live, so this page is rendered per
// request. Without this Next would prerender it at build time, which fails
// wherever the build runs without a database, CI included.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { counts, topPlayers, topGuilds } = await getPlatformSummary();

  return (
    <PageContainer className="gap-10">
      <Hero
        eyebrow="Albion Online"
        title="Every player, ranked by what they actually did"
        tagline="Search the killboard by player, guild or alliance. Kill and death history, the gear worn in every fight, and a performance rating computed from it."
        actions={
          topPlayers[0] ? (
            <>
              <Link
                href={`/players/${encodeURIComponent(topPlayers[0].id)}`}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                See a player profile
              </Link>
              <Link
                href="#top-players"
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-white dark:border-neutral-700 dark:hover:bg-neutral-900"
              >
                Browse the leaderboard
              </Link>
            </>
          ) : null
        }
      />

      <StatGrid>
        <StatCard label="Players" value={counts.players.toLocaleString("en-US")} />
        <StatCard label="Guilds" value={counts.guilds.toLocaleString("en-US")} />
        <StatCard label="Alliances" value={counts.alliances.toLocaleString("en-US")} />
        <StatCard label="Kill Events" value={counts.killEvents.toLocaleString("en-US")} />
      </StatGrid>

      <Section title="Top players by kill fame" className="scroll-mt-6" id="top-players">
        <PlayerTable
          players={topPlayers}
          emptyMessage="No players tracked yet. Run the database seed to load some."
        />
      </Section>

      <Section title="Guilds">
        <GuildTable
          guilds={topGuilds}
          getGuildHref={(guildId) => `/guilds/${encodeURIComponent(guildId)}`}
          emptyMessage="No guilds tracked yet."
        />
      </Section>

      <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
        Data is imported from the public Albion Online API. Ratings are computed by
        @albion/rating-engine.
      </p>
    </PageContainer>
  );
}
