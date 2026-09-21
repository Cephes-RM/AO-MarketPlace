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

// Albion ids are URL-safe base64 strings (e.g. "LR8GuAcsS9iGmvYgFVl0hQ").
const ALBION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A player currently in a guild, shaped for the listings. */
interface MemberRow {
  id: string;
  name: string;
  rating: number;
  stars: number;
  killFame: bigint;
  deathFame: bigint;
}

/** Current members of the given guilds, grouped by guild id. */
async function currentMembersByGuild(guildIds: string[]) {
  const memberships = await prisma.guildMembership.findMany({
    where: { guildId: { in: guildIds }, leftAt: null },
    select: {
      guildId: true,
      player: {
        select: {
          id: true,
          name: true,
          rating: true,
          stars: true,
          killFame: true,
          deathFame: true,
        },
      },
    },
  });

  const byGuild = new Map<string, MemberRow[]>();

  for (const membership of memberships) {
    const members = byGuild.get(membership.guildId) ?? [];
    members.push(membership.player);
    byGuild.set(membership.guildId, members);
  }

  return byGuild;
}

const sumFame = (members: MemberRow[], field: "killFame" | "deathFame") =>
  members.reduce((total, member) => total + member[field], BigInt(0));

const byKillFameThenName = (a: MemberRow, b: MemberRow) =>
  b.killFame > a.killFame ? 1 : b.killFame < a.killFame ? -1 : a.name.localeCompare(b.name);

const serializeMember = (member: MemberRow) => ({
  id: member.id,
  name: member.name,
  rating: member.rating,
  stars: member.stars,
  killFame: member.killFame.toString(),
  deathFame: member.deathFame.toString(),
});

/**
 * Returns an alliance with its member guilds and fame totals,
 * or null when the id is malformed or no alliance has it.
 */
export async function getAllianceById(allianceId: string) {
  if (typeof allianceId !== "string" || !ALBION_ID.test(allianceId)) {
    return null;
  }

  const alliance = await prisma.alliance.findUnique({
    where: { id: allianceId },
    include: { guilds: { select: { id: true, name: true } } },
  });

  if (!alliance) {
    return null;
  }

  const membersByGuild = await currentMembersByGuild(alliance.guilds.map((guild) => guild.id));

  const guilds = alliance.guilds
    .map((guild) => {
      const members = membersByGuild.get(guild.id) ?? [];
      return {
        id: guild.id,
        name: guild.name,
        memberCount: members.length,
        killFame: sumFame(members, "killFame"),
        deathFame: sumFame(members, "deathFame"),
      };
    })
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));

  return {
    id: alliance.id,
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
 * Returns a guild with its alliance and current members,
 * or null when the id is malformed or no guild has it.
 */
export async function getGuildById(guildId: string) {
  if (typeof guildId !== "string" || !ALBION_ID.test(guildId)) {
    return null;
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { alliance: { select: { id: true, name: true } } },
  });

  if (!guild) {
    return null;
  }

  const members = (await currentMembersByGuild([guild.id])).get(guild.id) ?? [];
  members.sort(byKillFameThenName);

  return {
    id: guild.id,
    name: guild.name,
    createdAt: guild.createdAt,
    alliance: guild.alliance,
    memberCount: members.length,
    killFame: sumFame(members, "killFame").toString(),
    deathFame: sumFame(members, "deathFame").toString(),
    members: members.map(serializeMember),
  };
}

export type GuildProfile = NonNullable<Awaited<ReturnType<typeof getGuildById>>>;

/** An equipped item, flattened out of a KillEvent loadout. */
export interface EquippedItem {
  slot: string;
  itemType: string;
  quality: number | null;
  count: number | null;
}

// Loadout slots are stored snake_case; the UI names them like the Albion API does.
const SLOT_NAMES: Record<string, string> = {
  main_hand: "mainHand",
  off_hand: "offHand",
  head: "head",
  body: "armor",
  shoe: "shoes",
  bag: "bag",
  cape: "cape",
  mount: "mount",
  potion: "potion",
  food: "food",
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Flattens a stored loadout into one entry per filled slot.
 * Slots that are absent, null or missing an item type are skipped, so a
 * partly recorded loadout still renders.
 */
export function parseLoadout(loadout: unknown): EquippedItem[] {
  const slots = asRecord(loadout);
  if (!slots) return [];

  const items: EquippedItem[] = [];

  for (const [rawSlot, rawItem] of Object.entries(slots)) {
    const slot = SLOT_NAMES[rawSlot];
    const item = asRecord(rawItem);
    if (!slot || !item) continue;

    const itemType = item.id ?? item.type;
    if (typeof itemType !== "string" || itemType.length === 0) continue;

    items.push({
      slot,
      itemType,
      quality: asNumber(item.quality),
      count: asNumber(item.count),
    });
  }

  return items;
}

/**
 * Returns a player's most recent kill events, newest first, with the equipment
 * worn by both sides. An unknown player, or one with no events, gives an empty
 * list; an event stored without a loadout gives an empty one.
 */
export async function getPlayerKillEvents(playerId: string, { limit = 10 } = {}) {
  if (typeof playerId !== "string" || !ALBION_ID.test(playerId)) {
    return [];
  }

  const events = await prisma.killEvent.findMany({
    where: { OR: [{ killerId: playerId }, { victimId: playerId }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      killer: { select: { id: true, name: true } },
      victim: { select: { id: true, name: true } },
    },
  });

  return events.map((event) => ({
    id: event.id,
    killer: event.killer,
    victim: event.victim,
    location: event.location,
    totalFame: event.totalFame.toString(),
    occurredAt: event.createdAt,
    killerItemPower: event.killerItemPower,
    victimItemPower: event.victimItemPower,
    killerEquipment: parseLoadout(event.killerLoadout),
    victimEquipment: parseLoadout(event.victimLoadout),
  }));
}

export type PlayerKillEvent = Awaited<ReturnType<typeof getPlayerKillEvents>>[number];

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
          id: true,
          name: true,
          rating: true,
          stars: true,
          killFame: true,
          deathFame: true,
        },
      }),
      prisma.guild.findMany({ take: topGuilds, select: { id: true, name: true } }),
    ]);

  const membersByGuild = await currentMembersByGuild(guilds.map((guild) => guild.id));

  return {
    counts: {
      players: playerCount,
      guilds: guildCount,
      alliances: allianceCount,
      killEvents: killEventCount,
    },
    topPlayers: players.map(serializeMember),
    topGuilds: guilds
      .map((guild) => {
        const members = membersByGuild.get(guild.id) ?? [];
        return {
          id: guild.id,
          name: guild.name,
          memberCount: members.length,
          killFame: sumFame(members, "killFame"),
          deathFame: sumFame(members, "deathFame"),
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

export * from "@prisma/client";
