import { PrismaClient } from "@prisma/client";

// Cache the client on globalThis in dev so hot reload doesn't exhaust
// database connections; always create a fresh client in production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function getPlayerById(playerId: string) {
  if (!playerId || typeof playerId !== "string") {
    return null;
  }

  try {
    const player = await prisma.player.findUnique({ where: { playerId } });

    if (!player) {
      return null;
    }

    return {
      ...player,
      fame: player.fame.toString(),
      killFame: player.killFame.toString(),
      deathFame: player.deathFame.toString(),
    };
  } catch (error) {
    console.error(error);
    throw new Error("Could not retrieve player data");
  }
}

export * from "@prisma/client";
