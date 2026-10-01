import type { Prisma } from "@prisma/client";
import { parseLoadout } from "./loadout";

// Keep recent activity bounded and avoid fetching the large raw API payload.
export const RECENT_COMBAT_LIMIT = 20;

export const combatEventSelect = {
  id: true,
  occurredAt: true,
  totalFame: true,
  location: true,
  battleId: true,
  killer: { select: { id: true, name: true } },
  victim: { select: { id: true, name: true } },
  killerLoadout: true,
  victimLoadout: true,
  killerItemPower: true,
  victimItemPower: true,
} as const satisfies Prisma.KillEventSelect;

type StoredCombatEvent = Prisma.KillEventGetPayload<{ select: typeof combatEventSelect }>;

export function serializeCombatEvent(event: StoredCombatEvent) {
  return {
    ...event,
    occurredAt: event.occurredAt.toISOString(),
    totalFame: event.totalFame.toString(),
    killerLoadout: parseLoadout(event.killerLoadout),
    victimLoadout: parseLoadout(event.victimLoadout),
  };
}

export type PlayerCombatEvent = ReturnType<typeof serializeCombatEvent>;
