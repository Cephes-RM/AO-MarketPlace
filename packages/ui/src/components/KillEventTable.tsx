import { Fragment } from "react";
import Link from "next/link";
import { cn } from "../lib/cn";
import { formatDateTime, formatFame, type FameValue } from "../lib/format";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { EquipmentLoadout, type EquipmentItem } from "./EquipmentLoadout";

export interface KillEventParticipant {
  /** The player id (`Player.id`, the Albion player id), used to build profile links. */
  id: string;
  name: string;
}

export interface KillEventRow {
  id: string;
  killer: KillEventParticipant;
  victim: KillEventParticipant;
  location: string;
  totalFame: FameValue;
  occurredAt: Date | string;
  /** Gear worn during the event. Empty or absent for events recorded without it. */
  killerEquipment?: EquipmentItem[];
  victimEquipment?: EquipmentItem[];
}

export interface KillEventTableProps {
  events: KillEventRow[];
  /** When set, each row is marked as a kill or death from this player's point of view. */
  playerId?: string;
  getPlayerHref?: (playerId: string) => string;
  /** Show the equipment worn by both sides under each event. */
  showEquipment?: boolean;
  emptyMessage?: string;
  className?: string;
}

const defaultPlayerHref = (playerId: string) => `/players/${encodeURIComponent(playerId)}`;

/** Killboard table of kill events, rendered in the order given. */
export function KillEventTable({
  events,
  playerId,
  getPlayerHref = defaultPlayerHref,
  showEquipment = false,
  emptyMessage = "No kill events yet.",
  className,
}: KillEventTableProps) {
  if (events.length === 0) {
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

  // Result, killer, victim, location, fame, date — the result column is optional.
  const columnCount = playerId ? 6 : 5;

  const renderPlayer = (player: KillEventParticipant) =>
    player.id === playerId ? (
      <span className="font-medium">{player.name}</span>
    ) : (
      <Link
        href={getPlayerHref(player.id)}
        className="font-medium hover:text-amber-600 hover:underline dark:hover:text-amber-400"
      >
        {player.name}
      </Link>
    );

  return (
    <Card className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:text-neutral-400">
          <tr>
            {playerId ? (
              <th scope="col" className="px-4 py-3 font-medium">
                Result
              </th>
            ) : null}
            <th scope="col" className="px-4 py-3 font-medium">
              Killer
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Victim
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Location
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Fame
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {events.map((event) => {
            const isKill = event.killer.id === playerId;
            return (
              <Fragment key={event.id}>
                <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  {playerId ? (
                    <td className="px-4 py-3">
                      <Badge tone={isKill ? "success" : "danger"}>
                        {isKill ? "Kill" : "Death"}
                      </Badge>
                    </td>
                  ) : null}
                  <td className="px-4 py-3 whitespace-nowrap">{renderPlayer(event.killer)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{renderPlayer(event.victim)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                    {event.location}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    title={formatFame(event.totalFame)}
                  >
                    {formatFame(event.totalFame, { compact: true })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                    {formatDateTime(event.occurredAt)}
                  </td>
                </tr>
                {showEquipment ? (
                  <tr className="border-none">
                    <td colSpan={columnCount} className="px-4 pt-0 pb-4">
                      <div className="flex flex-wrap gap-x-10 gap-y-4">
                        <EquipmentLoadout
                          label={`${event.killer.name} — killer`}
                          items={event.killerEquipment ?? []}
                          emptyMessage="No equipment recorded for the killer."
                        />
                        <EquipmentLoadout
                          label={`${event.victim.name} — victim`}
                          items={event.victimEquipment ?? []}
                          emptyMessage="No equipment recorded for the victim."
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
