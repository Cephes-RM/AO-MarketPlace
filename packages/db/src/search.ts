import { Prisma } from "@prisma/client";
import { prisma } from "./client";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 64;
const MAX_RESULTS_PER_CATEGORY = 5;

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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Exact match, then prefix (shorter names first), then a match anywhere else. */
function rankOrder(nameColumn: Prisma.Sql, term: string, prefixPattern: string): Prisma.Sql {
  return Prisma.sql`
    CASE
      WHEN lower(${nameColumn}) = lower(${term}) THEN 0
      WHEN lower(${nameColumn}) LIKE lower(${prefixPattern}) ESCAPE '\\' THEN 1
      ELSE 2
    END ASC,
    CASE
      WHEN lower(${nameColumn}) LIKE lower(${prefixPattern}) ESCAPE '\\'
      THEN char_length(${nameColumn})
    END ASC NULLS LAST,
    ${nameColumn} ASC
  `;
}

/** Case-insensitive search for a name that contains the query anywhere. */
export async function searchByName(query: string): Promise<SearchResults> {
  const term = query.trim();

  if (term.length < MIN_QUERY_LENGTH || term.length > MAX_QUERY_LENGTH) {
    return emptyResults();
  }

  const containsPattern = `%${escapeLike(term)}%`;
  const prefixPattern = `${escapeLike(term)}%`;

  const [players, guilds, alliances] = await Promise.all([
    prisma.$queryRaw<SearchPlayer[]>(Prisma.sql`
      SELECT
        p."id",
        p."name",
        g."name" AS "guildName"
      FROM "Player" p
      LEFT JOIN "GuildMembership" m
        ON m."playerId" = p."id" AND m."leftAt" IS NULL
      LEFT JOIN "Guild" g ON g."id" = m."guildId"
      WHERE p."name" ILIKE ${containsPattern} ESCAPE '\\'
      ORDER BY ${rankOrder(Prisma.sql`p."name"`, term, prefixPattern)}
      LIMIT ${MAX_RESULTS_PER_CATEGORY}
    `),
    prisma.$queryRaw<SearchNamedEntity[]>(Prisma.sql`
      SELECT "id", "name"
      FROM "Guild"
      WHERE "name" ILIKE ${containsPattern} ESCAPE '\\'
      ORDER BY ${rankOrder(Prisma.sql`"name"`, term, prefixPattern)}
      LIMIT ${MAX_RESULTS_PER_CATEGORY}
    `),
    prisma.$queryRaw<SearchNamedEntity[]>(Prisma.sql`
      SELECT "id", "name"
      FROM "Alliance"
      WHERE "name" ILIKE ${containsPattern} ESCAPE '\\'
      ORDER BY ${rankOrder(Prisma.sql`"name"`, term, prefixPattern)}
      LIMIT ${MAX_RESULTS_PER_CATEGORY}
    `),
  ]);

  return { players, guilds, alliances };
}
