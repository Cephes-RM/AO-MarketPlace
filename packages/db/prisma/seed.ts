import { players } from "./players";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  for (let player of players) {
    await prisma.player.upsert({
      where: { playerId: player.playerId },
      update: {},
      create: player,
    });
  }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });