import Image from "next/image";
import Link from "next/link";
import { getPlatformSummary } from "@albion/db";
import {
  Card,
  GuildTable,
  Hero,
  PageContainer,
  PlayerTable,
  Section,
  formatFame,
} from "@albion/ui";
import { Crest } from "@/components/Crest";
import { ItemBand } from "@/components/ItemBand";

// The counts and leaderboard are read live, so this page is rendered per
// request. Without this Next would prerender it at build time, which fails
// wherever the build runs without a database, CI included.
export const dynamic = "force-dynamic";

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

export default async function Home() {
  const { counts, topPlayers, topGuilds } = await getPlatformSummary();

  const plaques = [
    { label: "Players", value: counts.players },
    { label: "Guilds", value: counts.guilds },
    { label: "Alliances", value: counts.alliances },
    { label: "Kill events", value: counts.killEvents },
  ];

  return (
    <PageContainer className="gap-10">
      <Hero
        emblem={<Crest className="h-16 w-auto drop-shadow-[0_2px_10px_rgba(229,192,106,0.35)]" />}
        eyebrow="Albion Online"
        title="Know who you are fighting"
        tagline="Every tracked player, the gear they died in, and a rating earned on the killboard rather than claimed in chat."
        backdrop={
          <Image
            src="/hero.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover object-center"
          />
        }
        actions={
          topPlayers[0] ? (
            <>
              <Link
                href={`/players/${encodeURIComponent(topPlayers[0].id)}`}
                className="rounded-md border border-gold-300/40 bg-gradient-to-b from-gold-300 to-gold-500 px-5 py-2.5 font-display text-sm font-bold tracking-wide text-iron-950 shadow-lg transition hover:from-gold-100 hover:to-gold-300"
              >
                Open a profile
              </Link>
              <Link
                href="#leaderboard"
                className="rounded-md border border-gold-500/40 px-5 py-2.5 font-display text-sm font-bold tracking-wide text-gold-100 transition hover:border-gold-300/70 hover:bg-gold-500/10"
              >
                The leaderboard
              </Link>
            </>
          ) : null
        }
        footer={<ItemBand />}
      />

      {/* Counts, as struck plaques rather than plain cards. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {plaques.map((plaque) => (
          <Card
            key={plaque.label}
            className="relative overflow-hidden border-gold-500/25 bg-gradient-to-b from-white to-neutral-50 p-4 text-center dark:from-iron-800 dark:to-iron-900"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent"
            />
            <p className="font-display text-3xl font-bold text-neutral-900 tabular-nums dark:text-gold-100">
              {COUNT_FORMAT.format(plaque.value)}
            </p>
            <p className="mt-1 text-[11px] font-medium tracking-[0.2em] text-neutral-500 uppercase dark:text-neutral-400">
              {plaque.label}
            </p>
          </Card>
        ))}
      </div>

      <Section
        id="leaderboard"
        title="Hall of fame"
        className="scroll-mt-6"
        action={
          topPlayers[0] ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Leader: {topPlayers[0].name} · {formatFame(topPlayers[0].killFame, { compact: true })}{" "}
              kill fame
            </p>
          ) : null
        }
      >
        <PlayerTable
          players={topPlayers}
          showRank
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
        Data imported from the public Albion Online API · item art from Albion&apos;s render
        service · ratings computed by @albion/rating-engine
      </p>
    </PageContainer>
  );
}
