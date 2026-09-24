export type SearchEntityType = "player" | "guild" | "alliance";

/** What the search endpoint returns, grouped by kind. */
export interface SearchResults {
  players: { id: string; name: string; rating?: number }[];
  guilds: { id: string; name: string }[];
  alliances: { id: string; name: string }[];
}

/** One selectable row in the results list. */
export interface SearchOption {
  type: SearchEntityType;
  id: string;
  name: string;
  href: string;
  /** Shown on the right of the row, e.g. a player's rating. */
  detail?: string;
}

export interface SearchGroup {
  type: SearchEntityType;
  label: string;
  options: SearchOption[];
}

export const EMPTY_SEARCH_RESULTS: SearchResults = { players: [], guilds: [], alliances: [] };

const href = (type: SearchEntityType, id: string) => {
  const segment = type === "player" ? "players" : type === "guild" ? "guilds" : "alliances";
  return `/${segment}/${encodeURIComponent(id)}`;
};

/**
 * Turns grouped results into the sections the list renders, keeping players
 * first. Empty groups are dropped so no heading appears without rows under it.
 */
export function toSearchGroups(results: SearchResults | null | undefined): SearchGroup[] {
  if (!results) return [];

  const groups: SearchGroup[] = [
    {
      type: "player",
      label: "Players",
      options: (results.players ?? []).map((player) => ({
        type: "player" as const,
        id: player.id,
        name: player.name,
        href: href("player", player.id),
        ...(typeof player.rating === "number" ? { detail: `Rating ${player.rating}` } : {}),
      })),
    },
    {
      type: "guild",
      label: "Guilds",
      options: (results.guilds ?? []).map((guild) => ({
        type: "guild" as const,
        id: guild.id,
        name: guild.name,
        href: href("guild", guild.id),
      })),
    },
    {
      type: "alliance",
      label: "Alliances",
      options: (results.alliances ?? []).map((alliance) => ({
        type: "alliance" as const,
        id: alliance.id,
        name: alliance.name,
        href: href("alliance", alliance.id),
      })),
    },
  ];

  return groups.filter((group) => group.options.length > 0);
}

/** Every option in display order, which is the order the arrow keys follow. */
export function flattenSearchGroups(groups: SearchGroup[]): SearchOption[] {
  return groups.flatMap((group) => group.options);
}

/** Moves the highlighted row, wrapping at both ends. Returns -1 when empty. */
export function moveHighlight(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  return (((current + delta) % count) + count) % count;
}
