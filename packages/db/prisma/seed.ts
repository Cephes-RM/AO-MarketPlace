import { PrismaClient } from "@prisma/client";
import { players } from "./players";
import { events } from "./killEvents";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  // Seed players
  for (const player of players) {
    await prisma.player.upsert({
      where: {
        playerId: player.playerId,
      },
      update: player,
      create: player,
    });
  }

  // Seed kill events
  for (const event of events) {
    const killer = await prisma.player.findUnique({
      where: {
        playerId: event.killerId,
      },
    });

    const victim = await prisma.player.findUnique({
      where: {
        playerId: event.victimId,
      },
    });

    if (!killer || !victim) {
      //console.warn(
      //  `Skipping event ${event.id}: player not found.`);
      
      continue;
    }

    await prisma.killEvent.upsert({
      where: {
        eventId: event.id,
      },
      //to delete the update
      update: {
        killerId: killer.id,
        victimId: victim.id,
        totalFame: event.totalFame,
        location: event.location,
        createdAt: event.createdAt,
      },
      create: {
        eventId: event.id,
        killerId: killer.id,
        victimId: victim.id,
        totalFame: event.totalFame,
        location: event.location,
        createdAt: event.createdAt,
      },
    });
  }

  // Generate documentation
  const content =
    "# Seeded Players\n\n" +
    players.map((p) => `- ${p.playerId}`).join("\n");

  writeFileSync(
    join(__dirname, "../../../docs/seed_players.csv"),
    content
  );

  //console.log("Seed completed.");
}

main()
  .catch((e) => {
    //console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });