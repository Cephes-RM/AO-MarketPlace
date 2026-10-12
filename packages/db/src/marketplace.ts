import { prisma } from "./client";

export async function getAllianceById(allianceId: string) {
  if (!allianceId.trim()) throw new Error("Invalid alliance ID");

  const alliance = await prisma.alliance.findUnique({
    where: { id: allianceId },
    include: {
      guilds: {
        orderBy: { name: "asc" },
        include: { _count: { select: { memberships: { where: { leftAt: null } } } } },
      },
    },
  });

  if (!alliance) throw new Error("Alliance not found");
  return alliance;
}

export async function getGuildById(guildId: string) {
  if (!guildId.trim()) throw new Error("Invalid guild ID");

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: {
      alliance: { select: { id: true, name: true } },
      memberships: {
        where: { leftAt: null },
        orderBy: { player: { name: "asc" } },
        include: { player: { select: { id: true, name: true, fame: true, rating: true } } },
      },
    },
  });

  if (!guild) throw new Error("Guild not found");
  return guild;
}
