/** Shortest query worth hitting the database with. */
export const MIN_SEARCH_LENGTH = 2;

/** Longest query accepted; anything beyond this is noise. */
export const MAX_SEARCH_LENGTH = 64;

/**
 * Trims a raw query and caps its length.
 * Returns null when there is nothing worth searching for, so callers can skip
 * the round trip entirely.
 */
export function normalizeSearchTerm(query: unknown): string | null {
  if (typeof query !== "string") return null;

  const term = query.trim().slice(0, MAX_SEARCH_LENGTH);
  return term.length < MIN_SEARCH_LENGTH ? null : term;
}
