import Link from "next/link";
import { cn } from "../lib/cn";
import { fameRatio, formatFame, type FameValue } from "../lib/format";
import { Card } from "./Card";
import { StarRating } from "./StarRating";

export interface PlayerRow {
  /** The Albion player id (`external_player_id`). */
  id: string;
  name: string;
  rating: number;
  stars: number;
  killFame: FameValue;
  deathFame: FameValue;
}

export interface PlayerTableProps {
  players: PlayerRow[];
  getPlayerHref?: (playerId: string) => string;
  emptyMessage?: string;
  className?: string;
}

const defaultPlayerHref = (playerId: string) => `/players/${encodeURIComponent(playerId)}`;

/** Table of players, used for guild members and any other player listing. */
export function PlayerTable({
  players,
  getPlayerHref = defaultPlayerHref,
  emptyMessage = "No players yet.",
  className,
}: PlayerTableProps) {
  if (players.length === 0) {
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
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:text-neutral-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Player
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Rating
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Kill Fame
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Death Fame
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Ratio
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {players.map((player) => {
            const ratio = fameRatio(player.killFame, player.deathFame);
            return (
              <tr key={player.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  <Link
                    href={getPlayerHref(player.id)}
                    className="hover:text-amber-600 hover:underline dark:hover:text-amber-400"
                  >
                    {player.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <StarRating value={player.stars} />
                    <span className="tabular-nums text-neutral-600 dark:text-neutral-400">
                      {player.rating}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums" title={formatFame(player.killFame)}>
                  {formatFame(player.killFame, { compact: true })}
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums"
                  title={formatFame(player.deathFame)}
                >
                  {formatFame(player.deathFame, { compact: true })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {ratio === null ? "—" : ratio.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
