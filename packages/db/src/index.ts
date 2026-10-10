import { prisma } from "./client";
import { combatEventSelect, RECENT_COMBAT_LIMIT, serializeCombatEvent } from "./combat";

export { prisma };
export type { LoadoutItem, PlayerLoadout } from "./loadout";
export { parseLoadout } from "./loadout";
export type { PlayerCombatEvent } from "./combat";

export async function getPlayerById(playerId: string) {
  if (typeof playerId !== "string" || !playerId.trim()) {
    throw new Error("Invalid player ID");
  }

  try {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        kills: {
          take: RECENT_COMBAT_LIMIT,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          select: combatEventSelect,
        },
        deaths: {
          take: RECENT_COMBAT_LIMIT,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          select: combatEventSelect,
        },
        guildMemberships: {
          include: { guild: { include: { alliance: true } } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    if (!player) {
      throw new Error("Player not found");
    }

    return {
      ...player,
      fame: player.fame.toString(),
      killFame: player.killFame.toString(),
      deathFame: player.deathFame.toString(),
      kills: player.kills.map(serializeCombatEvent),
      deaths: player.deaths.map(serializeCombatEvent),
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export {
  searchByName,
  type SearchNamedEntity,
  type SearchPlayer,
  type SearchResults,
} from "./search";

export { getAllianceById, getGuildById, getLandingPageData } from "./marketplace";

export * from "@prisma/client";
