import Link from "next/link";
import { cn } from "../lib/cn";
import { Card } from "./Card";
import { RankBadge } from "./RankBadge";

export interface RankingRow {
  /** The entity id (`Guild.id` or `Alliance.id`, the Albion id). */
  id: string;
  name: string;
  memberCount: number;
  /** Mean rating of the current members, or null when there are none. */
  averageRating: number | null;
}

export interface RankingTableProps {
  rows: RankingRow[];
  /** Column heading for the name, e.g. "Guild" or "Alliance". */
  nameLabel: string;
  getHref: (id: string) => string;
  emptyMessage?: string;
  className?: string;
}

/**
 * Guilds or alliances ranked on the average rating of their current members,
 * rendered in the order given.
 */
export function RankingTable({
  rows,
  nameLabel,
  getHref,
  emptyMessage = "Nothing ranked yet.",
  className,
}: RankingTableProps) {
  if (rows.length === 0) {
    return (
      <Card
        className={cn(
          "px-6 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400",
          className,
        )}
      >
        {emptyMessage}
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[24rem] text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:text-neutral-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              #
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              {nameLabel}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Members
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Avg rating
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map((row, index) => (
            <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
              <td className="px-4 py-3">
                <RankBadge rank={index + 1} />
              </td>
              <td className="px-4 py-3 font-medium whitespace-nowrap">
                <Link
                  href={getHref(row.id)}
                  className="hover:text-amber-600 hover:underline dark:hover:text-amber-400"
                >
                  {row.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{row.memberCount}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {row.averageRating === null ? "—" : row.averageRating.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
