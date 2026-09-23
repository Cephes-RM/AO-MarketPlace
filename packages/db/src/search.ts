import { prisma } from "./client";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 64;
const MAX_RESULTS = 20;

export interface SearchPlayer {
  id: string;
  name: string;
  guildName: string | null;
}

export interface SearchNamedEntity {
  id: string;
  name: string;
}

export interface SearchResults {
  players: SearchPlayer[];
  guilds: SearchNamedEntity[];
  alliances: SearchNamedEntity[];
}

const emptyResults = (): SearchResults => ({
  players: [],
  guilds: [],
  alliances: [],
});

/** Case-insensitive prefix search across players, guilds, and alliances. */
export async function searchByName(query: string): Promise<SearchResults> {
  const term = query.trim();

  if (term.length < MIN_QUERY_LENGTH || term.length > MAX_QUERY_LENGTH) {
    return emptyResults();
  }

  const name = { startsWith: term, mode: "insensitive" as const };

  const [players, guilds, alliances] = await Promise.all([
    prisma.player.findMany({
      where: { name },
      orderBy: { name: "asc" },
      take: MAX_RESULTS,
      select: {
        id: true,
        name: true,
        guildMemberships: {
          where: { leftAt: null },
          take: 1,
          select: { guild: { select: { name: true } } },
        },
      },
    }),
    prisma.guild.findMany({
      where: { name },
      orderBy: { name: "asc" },
      take: MAX_RESULTS,
      select: { id: true, name: true },
    }),
    prisma.alliance.findMany({
      where: { name },
      orderBy: { name: "asc" },
      take: MAX_RESULTS,
      select: { id: true, name: true },
    }),
  ]);

  const pickedPlayers = players.slice(0, MAX_RESULTS).map((player) => ({
    id: player.id,
    name: player.name,
    guildName: player.guildMemberships[0]?.guild.name ?? null,
  }));
  const remainingAfterPlayers = MAX_RESULTS - pickedPlayers.length;
  const pickedGuilds = guilds.slice(0, remainingAfterPlayers);
  const pickedAlliances = alliances.slice(
    0,
    remainingAfterPlayers - pickedGuilds.length,
  );

  return {
    players: pickedPlayers,
    guilds: pickedGuilds,
    alliances: pickedAlliances,
  };
}
