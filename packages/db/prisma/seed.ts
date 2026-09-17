import { PrismaClient } from "@prisma/client";
import { alliances } from "./alliances";
import { guilds } from "./guilds";
import { players } from "./players";
import { events } from "./killEvents";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  // 1) Seed alliances first because guilds reference them.
  // We use upsert so running the seed again does not create duplicates.
  for (const alliance of alliances) {
    await prisma.alliance.upsert({
      where: {
        external_alliance_id: alliance.external_alliance_id,
      },
      update: {
        name: alliance.name,
      },
      create: {
        external_alliance_id: alliance.external_alliance_id,
        name: alliance.name,
      },
    });
  }

  // 2) Seed guilds next.
  // Each guild stores its external Albion guild ID and the alliance it belongs to.
  for (const guild of guilds) {
    await prisma.guild.upsert({
      where: {
        external_guild_id: guild.external_guild_id,
      },
      update: {
        name: guild.name,
        allianceId: guild.allianceId,
      },
      create: {
        external_guild_id: guild.external_guild_id,
        name: guild.name,
        allianceId: guild.allianceId,
      },
    });
  }

  // 3) Seed players and connect each one to its guild.
  // We first look up the guild by its external Albion guild ID, then set player.guildId.
  for (const player of players) {
    const guild = player.guildId
      ? await prisma.guild.findUnique({
          where: {
            external_guild_id: player.guildId,
          },
        })
      : null;

    const seededPlayer = await prisma.player.upsert({
      where: {
        external_player_id: player.external_player_id,
      },
      update: {
        ...player,
        guildId: guild?.external_guild_id ?? null,
      },
      create: {
        ...player,
        guildId: guild?.external_guild_id ?? null,
      },
    });

    const activeMembership = await prisma.guildMembership.findFirst({
      where: { playerId: seededPlayer.id, leftAt: null },
    });
    const currentGuildId = guild?.external_guild_id ?? null;

    if (activeMembership && activeMembership.guildId !== currentGuildId) {
      await prisma.guildMembership.update({
        where: { id: activeMembership.id },
        data: { leftAt: new Date() },
      });
    }

    if (currentGuildId && activeMembership?.guildId !== currentGuildId) {
      await prisma.guildMembership.create({
        data: {
          playerId: seededPlayer.id,
          guildId: currentGuildId,
        },
      });
    }
  }

  // 4) Seed kill events.
  // We resolve the killer and victim by their external Albion player IDs,
  // then save the event pointing to the internal Prisma Player records.
  for (const event of events) {
    const killer = await prisma.player.findUnique({
      where: {
        external_player_id: event.killerId,
      },
    });

    const victim = await prisma.player.findUnique({
      where: {
        external_player_id: event.victimId,
      },
    });

    // Skip invalid events if either player is not present in the database.
    if (!killer || !victim) {
      continue;
    }

    await prisma.killEvent.upsert({
      where: {
        id: event.id,
      },
      update: {
        killerId: killer.id,
        victimId: victim.id,
        totalFame: event.totalFame,
        location: event.location,
      },
      create: {
        id: event.id,
        killerId: killer.id,
        victimId: victim.id,
        totalFame: event.totalFame,
        location: event.location,
        createdAt: event.createdAt,
      },
    });
  }

  // 5) Generate a CSV from the player IDs for documentation or quick lookup.
  const content = players.map((p) => `${p.external_player_id}`).join("\n");

  writeFileSync(join(__dirname, "../../../docs/seed_players.csv"), content);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });