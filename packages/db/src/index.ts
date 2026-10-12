import { prisma } from "./client";

export { prisma };
export type { LoadoutItem, PlayerLoadout } from "./loadout";

export async function getPlayerById(playerId: string) {
  if (!playerId || typeof playerId !== "string") {
    throw new Error("Invalid player ID");
  }

  try {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        guildMemberships: {
          include: { guild: true },
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

export * from "@prisma/client";
