import Link from "next/link";
import { cn } from "../lib/cn";
import { fameRatio, formatFame, type FameValue } from "../lib/format";
import { Card } from "./Card";

export interface GuildRow {
  /** The Albion guild id (`external_guild_id`). */
  id: string;
  name: string;
  memberCount: number;
  killFame: FameValue;
  deathFame: FameValue;
}

export interface GuildTableProps {
  guilds: GuildRow[];
  /** When set, guild names link to the returned URL. */
  getGuildHref?: (guildId: string) => string;
  emptyMessage?: string;
  className?: string;
}

/** Table of guilds with member counts and fame totals, rendered in the order given. */
export function GuildTable({
  guilds,
  getGuildHref,
  emptyMessage = "No guilds yet.",
  className,
}: GuildTableProps) {
  if (guilds.length === 0) {
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
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:text-neutral-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Guild
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Members
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
          {guilds.map((guild) => {
            const ratio = fameRatio(guild.killFame, guild.deathFame);
            return (
              <tr key={guild.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="px-4 py-3 font-medium whitespace-nowrap">
                  {getGuildHref ? (
                    <Link
                      href={getGuildHref(guild.id)}
                      className="hover:text-amber-600 hover:underline dark:hover:text-amber-400"
                    >
                      {guild.name}
                    </Link>
                  ) : (
                    guild.name
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{guild.memberCount}</td>
                <td className="px-4 py-3 text-right tabular-nums" title={formatFame(guild.killFame)}>
                  {formatFame(guild.killFame, { compact: true })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums" title={formatFame(guild.deathFame)}>
                  {formatFame(guild.deathFame, { compact: true })}
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
