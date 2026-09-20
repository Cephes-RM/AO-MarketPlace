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
    throw new Error("Invalid player ID");
  }

  try {
    const player = await prisma.player.findUnique({ where: { external_player_id: playerId } });

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

// Albion ids are URL-safe base64 strings (e.g. "LR8GuAcsS9iGmvYgFVl0hQ").
const ALBION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Returns an alliance with its member guilds and fame totals,
 * or null when the id is malformed or no alliance has it.
 */
export async function getAllianceById(allianceId: string) {
  if (typeof allianceId !== "string" || !ALBION_ID.test(allianceId)) {
    return null;
  }

  const alliance = await prisma.alliance.findUnique({
    where: { external_alliance_id: allianceId },
    include: { guilds: true },
  });

  if (!alliance) {
    return null;
  }

  // Player.guildId references Guild.external_guild_id.
  const guildStats = await prisma.player.groupBy({
    by: ["guildId"],
    where: { guildId: { in: alliance.guilds.map((guild) => guild.external_guild_id) } },
    _count: { _all: true },
    _sum: { killFame: true, deathFame: true },
  });
  const statsByGuild = new Map(guildStats.map((stats) => [stats.guildId, stats]));

  const guilds = alliance.guilds
    .map((guild) => {
      const stats = statsByGuild.get(guild.external_guild_id);
      return {
        id: guild.external_guild_id,
        name: guild.name,
        memberCount: stats?._count._all ?? 0,
        killFame: stats?._sum.killFame ?? BigInt(0),
        deathFame: stats?._sum.deathFame ?? BigInt(0),
      };
    })
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  return {
    id: alliance.external_alliance_id,
    name: alliance.name,
    createdAt: alliance.createdAt,
    guildCount: guilds.length,
    memberCount: guilds.reduce((total, guild) => total + guild.memberCount, 0),
    killFame: guilds.reduce((total, guild) => total + guild.killFame, BigInt(0)).toString(),
    deathFame: guilds.reduce((total, guild) => total + guild.deathFame, BigInt(0)).toString(),
    guilds: guilds.map((guild) => ({
      ...guild,
      killFame: guild.killFame.toString(),
      deathFame: guild.deathFame.toString(),
    })),
  };
}

export type AllianceProfile = NonNullable<Awaited<ReturnType<typeof getAllianceById>>>;

/**
 * Everything the landing page shows: how much the database tracks, plus the
 * highest ranked players and guilds as entry points into the site.
 */
export async function getPlatformSummary({ topPlayers = 5, topGuilds = 5 } = {}) {
  const [playerCount, guildCount, allianceCount, killEventCount, players, guilds] =
    await Promise.all([
      prisma.player.count(),
      prisma.guild.count(),
      prisma.alliance.count(),
      prisma.killEvent.count(),
      prisma.player.findMany({
        orderBy: [{ killFame: "desc" }, { name: "asc" }],
        take: topPlayers,
        select: {
          external_player_id: true,
          name: true,
          rating: true,
          stars: true,
          killFame: true,
          deathFame: true,
        },
      }),
      prisma.guild.findMany({
        take: topGuilds,
        select: { external_guild_id: true, name: true },
      }),
    ]);

  // Player.guildId references Guild.external_guild_id.
  const guildStats = await prisma.player.groupBy({
    by: ["guildId"],
    where: { guildId: { in: guilds.map((guild) => guild.external_guild_id) } },
    _count: { _all: true },
    _sum: { killFame: true, deathFame: true },
  });
  const statsByGuild = new Map(guildStats.map((stats) => [stats.guildId, stats]));

  return {
    counts: {
      players: playerCount,
      guilds: guildCount,
      alliances: allianceCount,
      killEvents: killEventCount,
    },
    topPlayers: players.map((player) => ({
      id: player.external_player_id,
      name: player.name,
      rating: player.rating,
      stars: player.stars,
      killFame: player.killFame.toString(),
      deathFame: player.deathFame.toString(),
    })),
    topGuilds: guilds
      .map((guild) => {
        const stats = statsByGuild.get(guild.external_guild_id);
        return {
          id: guild.external_guild_id,
          name: guild.name,
          memberCount: stats?._count._all ?? 0,
          killFame: stats?._sum.killFame ?? BigInt(0),
          deathFame: stats?._sum.deathFame ?? BigInt(0),
        };
      })
      .sort((a, b) => (b.killFame > a.killFame ? 1 : b.killFame < a.killFame ? -1 : 0))
      .map((guild) => ({
        ...guild,
        killFame: guild.killFame.toString(),
        deathFame: guild.deathFame.toString(),
      })),
  };
}

export type PlatformSummary = Awaited<ReturnType<typeof getPlatformSummary>>;

/**
 * Returns a guild with its alliance and member list,
 * or null when the id is malformed or no guild has it.
 */
export async function getGuildById(guildId: string) {
  if (typeof guildId !== "string" || !ALBION_ID.test(guildId)) {
    return null;
  }

  const guild = await prisma.guild.findUnique({
    where: { external_guild_id: guildId },
    include: {
      alliance: { select: { external_alliance_id: true, name: true } },
    },
  });

  if (!guild) {
    return null;
  }

  // Player.guildId references Guild.external_guild_id.
  const members = await prisma.player.findMany({
    where: { guildId: guild.external_guild_id },
    orderBy: [{ killFame: "desc" }, { name: "asc" }],
    select: {
      external_player_id: true,
      name: true,
      rating: true,
      stars: true,
      killFame: true,
      deathFame: true,
    },
  });

  const killFame = members.reduce((total, member) => total + member.killFame, BigInt(0));
  const deathFame = members.reduce((total, member) => total + member.deathFame, BigInt(0));

  return {
    id: guild.external_guild_id,
    name: guild.name,
    createdAt: guild.createdAt,
    alliance: guild.alliance
      ? { id: guild.alliance.external_alliance_id, name: guild.alliance.name }
      : null,
    memberCount: members.length,
    killFame: killFame.toString(),
    deathFame: deathFame.toString(),
    members: members.map((member) => ({
      id: member.external_player_id,
      name: member.name,
      rating: member.rating,
      stars: member.stars,
      killFame: member.killFame.toString(),
      deathFame: member.deathFame.toString(),
    })),
  };
}

export type GuildProfile = NonNullable<Awaited<ReturnType<typeof getGuildById>>>;

/** An equipped item, as stored in KillEventItem. */
export interface EquippedItem {
  slot: string;
  itemType: string;
  quality: number | null;
  count: number | null;
}

/**
 * Returns a player's most recent kill events, newest first, with the equipment
 * worn by both sides. An unknown player, or one with no events, gives an empty
 * list; an event recorded before equipment was tracked gives empty loadouts.
 */
export async function getPlayerKillEvents(playerId: string, { limit = 10 } = {}) {
  if (typeof playerId !== "string" || !ALBION_ID.test(playerId)) {
    return [];
  }

  const player = await prisma.player.findUnique({
    where: { external_player_id: playerId },
    select: { id: true },
  });

  if (!player) {
    return [];
  }

  const events = await prisma.killEvent.findMany({
    where: { OR: [{ killerId: player.id }, { victimId: player.id }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      killer: { select: { external_player_id: true, name: true } },
      victim: { select: { external_player_id: true, name: true } },
      items: true,
    },
  });

  const equipmentFor = (
    items: { role: string; slot: string; itemType: string; quality: number | null; count: number | null }[],
    role: string,
  ): EquippedItem[] =>
    items
      .filter((item) => item.role === role)
      .map(({ slot, itemType, quality, count }) => ({ slot, itemType, quality, count }));

  return events.map((event) => ({
    id: event.id,
    killer: { id: event.killer.external_player_id, name: event.killer.name },
    victim: { id: event.victim.external_player_id, name: event.victim.name },
    location: event.location,
    totalFame: event.totalFame.toString(),
    occurredAt: event.createdAt,
    killerEquipment: equipmentFor(event.items, "KILLER"),
    victimEquipment: equipmentFor(event.items, "VICTIM"),
  }));
}

export type PlayerKillEvent = Awaited<ReturnType<typeof getPlayerKillEvents>>[number];

export * from "@prisma/client";
