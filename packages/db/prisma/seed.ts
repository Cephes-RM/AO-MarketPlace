import { PrismaClient } from "@prisma/client";
import { alliances } from "./alliances";
import { guilds } from "./guilds";
import { players } from "./players";
import { events } from "./killEvents";
import { guildMemberships } from "./guildMemberships";

const prisma = new PrismaClient();

async function main() {
  // 1) Seed alliances first because guilds reference them.
  // We use upsert so running the seed again does not create duplicates.
  for (const alliance of alliances) {
    await prisma.alliance.upsert({
      where: {
        id: alliance.id,
      },
      update: {
        name: alliance.name,
      },
      create: {
        id: alliance.id,
        name: alliance.name,
      },
    });
  }

  // 2) Seed guilds next.
  // Each guild stores its external Albion guild ID as id and the alliance it belongs to.
  for (const guild of guilds) {
    await prisma.guild.upsert({
      where: {
        id: guild.id,
      },
      update: {
        name: guild.name,
        allianceId: guild.allianceId,
      },
      create: {
        id: guild.id,
        name: guild.name,
        allianceId: guild.allianceId,
      },
    });
  }

  // 3) Seed players without keeping unused return value.
  for (const player of players) {
    await prisma.player.upsert({
      where: {
        id: player.id,
      },
      update: {
        ...player,
      },
      create: {
        ...player,
      },
    });
  }

  // 4) Seed guild memberships with primary key lookups and safe updates.
  for (const membership of guildMemberships) {
    const player = await prisma.player.findUnique({
      where: { id: membership.playerId },
    });

    const guild = await prisma.guild.findUnique({
      where: { id: membership.guildId },
    });

    if (!player || !guild) {
      continue;
    }

    await prisma.guildMembership.upsert({
      where: {
        playerId_guildId_joinedAt: {
          playerId: player.id,
          guildId: guild.id,
          joinedAt: membership.joinedAt,
        },
      },
      update: {
        // Only update leftAt if supported by reliable source data
        ...(membership.leftAt instanceof Date ? { leftAt: membership.leftAt } : {}),
      },
      create: {
        playerId: player.id,
        guildId: guild.id,
        joinedAt: membership.joinedAt,
        leftAt: membership.leftAt ?? null,
      },
    });
  }

  // 5) Seed kill events, participants, and equipment.
  for (const event of events) {
    const killer = await prisma.player.findUnique({
      where: {
        id: event.killerId,
      },
    });

    const victim = await prisma.player.findUnique({
      where: {
        id: event.victimId,
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
        killerLoadout: event.killerLoadout ?? undefined,
        victimLoadout: event.victimLoadout ?? undefined,
        killerItemPower: event.killerItemPower,
        victimItemPower: event.victimItemPower,
      },
      create: {
        id: event.id,
        killerId: killer.id,
        victimId: victim.id,
        totalFame: event.totalFame,
        location: event.location,
        createdAt: event.createdAt,
        killerLoadout: event.killerLoadout ?? undefined,
        victimLoadout: event.victimLoadout ?? undefined,
        killerItemPower: event.killerItemPower,
        victimItemPower: event.victimItemPower,
      },
    });

    // Seed assisting participants if available
    if (event.participants && event.participants.length > 0) {
      for (const participant of event.participants) {
        // Avoid adding the primary killer as an assistant
        if (participant.playerId === killer.id) {
          continue;
        }

        const participantPlayer = await prisma.player.findUnique({
          where: { id: participant.playerId },
        });

        if (!participantPlayer) {
          continue;
        }

        await prisma.killParticipant.upsert({
          where: {
            killEventId_playerId: {
              killEventId: event.id,
              playerId: participant.playerId,
            },
          },
          update: {
            damageDone: participant.damageDone,
            healingDone: participant.healingDone,
            killFame: participant.killFame,
            isPrimary: participant.isPrimary ?? false,
            loadout: participant.loadout ?? undefined,
            itemPower: participant.itemPower,
          },
          create: {
            killEventId: event.id,
            playerId: participant.playerId,
            damageDone: participant.damageDone,
            healingDone: participant.healingDone,
            killFame: participant.killFame,
            isPrimary: participant.isPrimary ?? false,
            loadout: participant.loadout ?? undefined,
            itemPower: participant.itemPower,
          },
        });
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });