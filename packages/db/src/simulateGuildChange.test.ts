import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, simulateGuildChange } from "./index";
import { Prisma } from "@prisma/client";

describe("4.8 Detect guild changes and write history (simulateGuildChange)", () => {
  const testRunId = `p42_${Date.now()}`;
  const guildAId = `guild_a_${testRunId}`;
  const guildBId = `guild_b_${testRunId}`;

  beforeAll(async () => {
    // Set up test guilds
    await prisma.guild.createMany({
      data: [
        { id: guildAId, name: "Test Guild Alpha" },
        { id: guildBId, name: "Test Guild Beta" },
      ],
    });
  });

  afterAll(async () => {
    // Clean up created test data
    await prisma.guildMembership.deleteMany({
      where: {
        OR: [
          { playerId: { startsWith: `player_${testRunId}` } },
          { guildId: { in: [guildAId, guildBId] } },
        ],
      },
    });

    await prisma.player.deleteMany({
      where: { id: { startsWith: `player_${testRunId}` } },
    });

    await prisma.guild.deleteMany({
      where: { id: { in: [guildAId, guildBId] } },
    });
  });

  async function createTestPlayer(suffix: string) {
    const playerId = `player_${testRunId}_${suffix}`;
    return await prisma.player.create({
      data: {
        id: playerId,
        name: `TestPlayer_${suffix}`,
        region: "europe",
        fame: BigInt(1000),
        killFame: BigInt(500),
        deathFame: BigInt(200),
      },
    });
  }

  it("first-seen player gets initial membership", async () => {
    const player = await createTestPlayer("initial");
    const joinedAt = new Date("2026-01-01T10:00:00Z");

    const result = await simulateGuildChange({
      playerId: player.id,
      guildId: guildAId,
      effectiveAt: joinedAt,
    });

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("INITIAL_MEMBERSHIP");
    expect(result.previousGuildId).toBeNull();
    expect(result.currentGuildId).toBe(guildAId);
    expect(result.closedMembership).toBeNull();
    expect(result.newMembership).not.toBeNull();
    expect(result.newMembership?.guildId).toBe(guildAId);
    expect(result.newMembership?.leftAt).toBeNull();

    // Verify database state
    const memberships = await prisma.guildMembership.findMany({
      where: { playerId: player.id },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].guildId).toBe(guildAId);
    expect(memberships[0].leftAt).toBeNull();
  });

  it("transition 1 (Guild to Guild transfer): closes old membership and opens new one in a single transaction", async () => {
    const player = await createTestPlayer("transfer");
    const initialJoin = new Date("2026-01-01T10:00:00Z");
    const transferDate = new Date("2026-02-01T15:00:00Z");

    // Start in Guild A
    await simulateGuildChange({
      playerId: player.id,
      guildId: guildAId,
      effectiveAt: initialJoin,
    });

    // Transfer from Guild A to Guild B
    const result = await simulateGuildChange({
      playerId: player.id,
      guildId: guildBId,
      effectiveAt: transferDate,
    });

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("TRANSFER");
    expect(result.previousGuildId).toBe(guildAId);
    expect(result.currentGuildId).toBe(guildBId);

    // Old membership closed
    expect(result.closedMembership).not.toBeNull();
    expect(result.closedMembership?.guildId).toBe(guildAId);
    expect(result.closedMembership?.leftAt?.toISOString()).toBe(transferDate.toISOString());

    // New membership opened
    expect(result.newMembership).not.toBeNull();
    expect(result.newMembership?.guildId).toBe(guildBId);
    expect(result.newMembership?.joinedAt.toISOString()).toBe(transferDate.toISOString());
    expect(result.newMembership?.leftAt).toBeNull();

    // Verify in database: exactly 1 open membership, exactly 1 closed membership
    const memberships = await prisma.guildMembership.findMany({
      where: { playerId: player.id },
      orderBy: { joinedAt: "asc" },
    });
    expect(memberships).toHaveLength(2);

    expect(memberships[0].guildId).toBe(guildAId);
    expect(memberships[0].leftAt?.toISOString()).toBe(transferDate.toISOString());

    expect(memberships[1].guildId).toBe(guildBId);
    expect(memberships[1].leftAt).toBeNull();

    const activeMemberships = await prisma.guildMembership.findMany({
      where: { playerId: player.id, leftAt: null },
    });
    expect(activeMemberships).toHaveLength(1);
    expect(activeMemberships[0].guildId).toBe(guildBId);
  });

  it("transition 2 (Guild to Guildless): closes old membership without opening a new one", async () => {
    const player = await createTestPlayer("to_guildless");
    const initialJoin = new Date("2026-01-01T10:00:00Z");
    const leaveDate = new Date("2026-03-01T12:00:00Z");

    // Start in Guild A
    await simulateGuildChange({
      playerId: player.id,
      guildId: guildAId,
      effectiveAt: initialJoin,
    });

    // Player leaves guild (becomes guildless)
    const result = await simulateGuildChange({
      playerId: player.id,
      guildId: null,
      effectiveAt: leaveDate,
    });

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("GUILD_TO_GUILDLESS");
    expect(result.previousGuildId).toBe(guildAId);
    expect(result.currentGuildId).toBeNull();
    expect(result.closedMembership?.guildId).toBe(guildAId);
    expect(result.closedMembership?.leftAt?.toISOString()).toBe(leaveDate.toISOString());
    expect(result.newMembership).toBeNull();

    // Verify in database: 0 active memberships
    const active = await prisma.guildMembership.findMany({
      where: { playerId: player.id, leftAt: null },
    });
    expect(active).toHaveLength(0);

    const all = await prisma.guildMembership.findMany({
      where: { playerId: player.id },
    });
    expect(all).toHaveLength(1);
    expect(all[0].leftAt?.toISOString()).toBe(leaveDate.toISOString());
  });

  it("transition 3 (Guildless to Guild): opens new membership for a previously guildless player", async () => {
    const player = await createTestPlayer("guildless_to_guild");
    const initialJoin = new Date("2026-01-01T10:00:00Z");
    const leaveDate = new Date("2026-02-01T10:00:00Z");
    const rejoinDate = new Date("2026-04-01T10:00:00Z");

    // Join Guild A, then leave (become guildless)
    await simulateGuildChange({
      playerId: player.id,
      guildId: guildAId,
      effectiveAt: initialJoin,
    });
    await simulateGuildChange({
      playerId: player.id,
      guildId: null,
      effectiveAt: leaveDate,
    });

    // Rejoin via Guild B
    const result = await simulateGuildChange({
      playerId: player.id,
      guildId: guildBId,
      effectiveAt: rejoinDate,
    });

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("GUILDLESS_TO_GUILD");
    expect(result.previousGuildId).toBeNull();
    expect(result.currentGuildId).toBe(guildBId);
    expect(result.closedMembership).toBeNull();
    expect(result.newMembership?.guildId).toBe(guildBId);
    expect(result.newMembership?.leftAt).toBeNull();

    // Verify in database: 1 closed, 1 open
    const all = await prisma.guildMembership.findMany({
      where: { playerId: player.id },
      orderBy: { joinedAt: "asc" },
    });
    expect(all).toHaveLength(2);
    expect(all[0].guildId).toBe(guildAId);
    expect(all[0].leftAt?.toISOString()).toBe(leaveDate.toISOString());
    expect(all[1].guildId).toBe(guildBId);
    expect(all[1].leftAt).toBeNull();
  });

  it("no change writes nothing to the database", async () => {
    const player = await createTestPlayer("no_change");
    const joinedAt = new Date("2026-01-01T10:00:00Z");

    // Join Guild A
    await simulateGuildChange({
      playerId: player.id,
      guildId: guildAId,
      effectiveAt: joinedAt,
    });

    const beforeMemberships = await prisma.guildMembership.findMany({
      where: { playerId: player.id },
    });

    // Same guild provided
    const result = await simulateGuildChange({
      playerId: player.id,
      guildId: guildAId,
      effectiveAt: new Date("2026-02-01T10:00:00Z"),
    });

    expect(result.changed).toBe(false);
    expect(result.transition).toBe("NO_CHANGE");
    expect(result.currentGuildId).toBe(guildAId);
    expect(result.closedMembership).toBeNull();

    // Verify database was untouched
    const afterMemberships = await prisma.guildMembership.findMany({
      where: { playerId: player.id },
    });
    expect(afterMemberships).toEqual(beforeMemberships);

    // Also verify for guildless player
    const guildlessPlayer = await createTestPlayer("guildless_no_change");
    const guildlessResult = await simulateGuildChange({
      playerId: guildlessPlayer.id,
      guildId: null,
    });

    expect(guildlessResult.changed).toBe(false);
    expect(guildlessResult.transition).toBe("NO_CHANGE");

    const guildlessCount = await prisma.guildMembership.count({
      where: { playerId: guildlessPlayer.id },
    });
    expect(guildlessCount).toBe(0);
  });

  it("proves the database rejects a second open membership for the same player", async () => {
    const player = await createTestPlayer("unique_constraint");
    const joinedAt = new Date("2026-01-01T10:00:00Z");

    // Open first membership in Guild A
    await prisma.guildMembership.create({
      data: {
        playerId: player.id,
        guildId: guildAId,
        joinedAt,
        leftAt: null,
      },
    });

    // Attempting to directly insert a second open membership without closing the first one
    // MUST be rejected by PostgreSQL's partial unique index GuildMembership_one_current_per_player
    let caughtError: unknown = null;
    try {
      await prisma.guildMembership.create({
        data: {
          playerId: player.id,
          guildId: guildBId,
          joinedAt: new Date("2026-02-01T10:00:00Z"),
          leftAt: null,
        },
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    // Prisma code P2002 represents Unique constraint failed
    const prismaError = caughtError as Prisma.PrismaClientKnownRequestError;
    expect(prismaError.code).toBe("P2002");
  });
});
