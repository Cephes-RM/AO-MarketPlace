import type { Metadata } from "next";
import Link from "next/link";
import { getLandingPageData } from "@albion/db";
import {
  EmptyState,
  ErrorState,
  PageContainer,
  SectionHeading,
  StatCard,
} from "@albion/ui";

export const metadata: Metadata = {
  title: "Albion Online Player and Guild Directory",
  description:
    "Discover top Albion Online players and guilds, and explore community profiles powered by public game data.",
};

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("en");

export default async function Home() {
  let data: Awaited<ReturnType<typeof getLandingPageData>> | null = null;
  try {
    data = await getLandingPageData();
  } catch {
    // Keep the public landing page useful when the database is unavailable.
  }

  return (
    <PageContainer>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">THE ALBION ONLINE COMMUNITY INDEX</p>
          <h1>Find your next rival, ally, or adventure.</h1>
          <p className="hero__description">
            Explore player and guild profiles built from public Albion Online
            game data.
          </p>
          <a className="button button--primary" href="#players">
            Explore the rankings <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="hero__art" aria-hidden="true">
          <span className="hero__orb hero__orb--one" />
          <span className="hero__orb hero__orb--two" />
          <span className="hero__sigil">A</span>
          <span className="hero__caption">THE WORLD IS YOURS TO SHAPE</span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Directory totals">
        {data ? (
          <>
            <StatCard label="Players tracked" value={numberFormat.format(data.counts.players)} />
            <StatCard label="Guilds indexed" value={numberFormat.format(data.counts.guilds)} />
            <StatCard label="Alliances listed" value={numberFormat.format(data.counts.alliances)} />
          </>
        ) : (
          <div className="stats-grid__error">
            <ErrorState title="Directory totals are unavailable">
              The database could not be reached. Try refreshing the page.
            </ErrorState>
          </div>
        )}
      </section>

      <section className="directory-section" id="players">
        <SectionHeading
          title="Players to watch"
          description="Players with the highest recorded fame in the directory."
        />
        {data?.players.length ? (
          <div className="directory-list">
            {data.players.map((player, index) => (
              <Link className="directory-row" href={`/players/${encodeURIComponent(player.id)}`} key={player.id}>
                <span className="directory-row__rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="directory-row__main">
                  <strong>{player.name}</strong>
                  <span>{numberFormat.format(BigInt(player.fame))} total fame</span>
                </span>
                <span className="directory-row__score">TOP <small>fame</small></span>
                <span className="directory-row__arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : data ? (
          <EmptyState title="No player rankings yet">
            Player profiles will appear here as the directory is populated.
          </EmptyState>
        ) : (
          <ErrorState title="Player rankings are unavailable">
            Player data could not be loaded right now.
          </ErrorState>
        )}
      </section>

      <section className="directory-section" id="guilds">
        <SectionHeading
          title="Guilds making moves"
          description="Guilds with the most recorded membership history."
        />
        {data?.guilds.length ? (
          <div className="directory-list">
            {data.guilds.map((guild, index) => (
              <Link className="directory-row" href={`/guilds/${encodeURIComponent(guild.id)}`} key={guild.id}>
                <span className="directory-row__rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="directory-row__main">
                  <strong>{guild.name}</strong>
                  <span>{guild.alliance?.name ?? "Independent guild"}</span>
                </span>
                <span className="directory-row__score">{numberFormat.format(guild._count.memberships)} <small>member records</small></span>
                <span className="directory-row__arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : data ? (
          <EmptyState title="No guilds listed yet">
            Guild profiles will appear here as the directory is populated.
          </EmptyState>
        ) : (
          <ErrorState title="Guild rankings are unavailable">
            Guild data could not be loaded right now.
          </ErrorState>
        )}
      </section>

      <section className="closing-banner">
        <div>
          <p className="eyebrow">BUILT FOR THE COMMUNITY</p>
          <h2>Every battle has a bigger story.</h2>
        </div>
        <p>Browse the people, guilds, and alliances that shape the world.</p>
      </section>
    </PageContainer>
  );
}
