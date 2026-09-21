/** A guild or alliance ranked on the rating of its current members. */
export interface RankingRow {
  id: string;
  name: string;
  memberCount: number;
  /** Mean rating of the current members, or null when there are none. */
  averageRating: number | null;
}

/** Builds a ranking row from the ratings of an entity's current members. */
export function rankingRow(entity: { id: string; name: string }, ratings: number[]): RankingRow {
  return {
    id: entity.id,
    name: entity.name,
    memberCount: ratings.length,
    averageRating:
      ratings.length === 0
        ? null
        : ratings.reduce((total, rating) => total + rating, 0) / ratings.length,
  };
}

/**
 * Highest average rating first. An average says nothing without members, so
 * empty rosters rank last; ties go to the larger roster, then to the name.
 */
export function byAverageRating(a: RankingRow, b: RankingRow): number {
  return (
    (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
    b.memberCount - a.memberCount ||
    a.name.localeCompare(b.name)
  );
}

/** Ranks entities by the average rating of their members and keeps the top `limit`. */
export function rankByAverageRating(rows: RankingRow[], limit: number): RankingRow[] {
  return [...rows].sort(byAverageRating).slice(0, limit);
}
