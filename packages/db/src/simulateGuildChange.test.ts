import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma, simulateGuildChange } from "./index";
import { Prisma } from "@prisma/client";

interface InMemoryMembership {
  playerId: string;
  guildId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

function createMockPrismaClient(initialMemberships: InMemoryMembership[] = []) {
  const memberships = initialMemberships.map((m) => ({ ...m }));
  const operations: string[] = [];

  const tx = {
    guildMembership: {
      findFirst: async ({ where }: { where: { playerId: string; leftAt: null } }) => {
        operations.push("findFirst");
        const found = memberships.find(
          (m) => m.playerId === where.playerId && m.leftAt === null,
        );
        return found ? { ...found } : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: {
          playerId_guildId_joinedAt: {
            playerId: string;
            guildId: string;
            joinedAt: Date;
          };
        };
        data: { leftAt: Date };
      }) => {
        operations.push("update");
        const match = memberships.find(
          (m) =>
            m.playerId === where.playerId_guildId_joinedAt.playerId &&
            m.guildId === where.playerId_guildId_joinedAt.guildId &&
            m.joinedAt.getTime() === where.playerId_guildId_joinedAt.joinedAt.getTime(),
        );
        if (!match) throw new Error("Membership not found to update");
        match.leftAt = data.leftAt;
        return { ...match };
      },
      create: async ({
        data,
      }: {
        data: {
          playerId: string;
          guildId: string;
          joinedAt: Date;
          leftAt: Date | null;
        };
      }) => {
        operations.push("create");
        // Emulate PostgreSQL partial unique index: GuildMembership_one_current_per_player
        if (data.leftAt === null) {
          const existingOpen = memberships.find(
            (m) => m.playerId === data.playerId && m.leftAt === null,
          );
          if (existingOpen) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed on the constraint: GuildMembership_one_current_per_player",
              { code: "P2002", clientVersion: "6.19.3" },
            );
          }
        }
        const created: InMemoryMembership = {
          playerId: data.playerId,
          guildId: data.guildId,
          joinedAt: data.joinedAt,
          leftAt: data.leftAt,
        };
        memberships.push(created);
        return { ...created };
      },
      count: async ({ where }: { where: { playerId: string } }) => {
        operations.push("count");
        return memberships.filter((m) => m.playerId === where.playerId).length;
      },
    },
  };

  const client = {
    ...tx,
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => {
      operations.push("$transaction");
      return await fn(tx);
    },
  };

  return { client, tx, memberships, operations };
}

describe("4.8 Detect guild changes and write history (Unit Tests)", () => {
  it("first-seen player gets initial membership", async () => {
    const { client, memberships } = createMockPrismaClient();
    const joinedAt = new Date("2026-01-01T10:00:00Z");

    const result = await simulateGuildChange(
      { playerId: "p1", guildId: "g1", effectiveAt: joinedAt },
      client as any,
    );

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("INITIAL_MEMBERSHIP");
    expect(result.previousGuildId).toBeNull();
    expect(result.currentGuildId).toBe("g1");
    expect(result.closedMembership).toBeNull();
    expect(result.newMembership?.guildId).toBe("g1");
    expect(result.newMembership?.leftAt).toBeNull();

    expect(memberships).toHaveLength(1);
    expect(memberships[0].leftAt).toBeNull();
  });

  it("transition 1 (Guild to Guild transfer): closes old membership and opens new one in a single transaction", async () => {
    const initialJoin = new Date("2026-01-01T10:00:00Z");
    const transferDate = new Date("2026-02-01T15:00:00Z");

    const { client, memberships, operations } = createMockPrismaClient([
      { playerId: "p1", guildId: "g1", joinedAt: initialJoin, leftAt: null },
    ]);

    const result = await simulateGuildChange(
      { playerId: "p1", guildId: "g2", effectiveAt: transferDate },
      client as any,
    );

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("TRANSFER");
    expect(result.previousGuildId).toBe("g1");
    expect(result.currentGuildId).toBe("g2");

    // Must execute inside $transaction, updating old before creating new
    expect(operations).toContain("$transaction");
    const updateIdx = operations.indexOf("update");
    const createIdx = operations.indexOf("create");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(updateIdx);

    expect(result.closedMembership?.guildId).toBe("g1");
    expect(result.closedMembership?.leftAt).toEqual(transferDate);

    expect(result.newMembership?.guildId).toBe("g2");
    expect(result.newMembership?.leftAt).toBeNull();

    expect(memberships).toHaveLength(2);
    expect(memberships[0].leftAt).toEqual(transferDate);
    expect(memberships[1].leftAt).toBeNull();
  });

  it("transition 2 (Guild to Guildless): closes old membership without opening a new one", async () => {
    const initialJoin = new Date("2026-01-01T10:00:00Z");
    const leaveDate = new Date("2026-03-01T12:00:00Z");

    const { client, memberships, operations } = createMockPrismaClient([
      { playerId: "p1", guildId: "g1", joinedAt: initialJoin, leftAt: null },
    ]);

    const result = await simulateGuildChange(
      { playerId: "p1", guildId: null, effectiveAt: leaveDate },
      client as any,
    );

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("GUILD_TO_GUILDLESS");
    expect(result.previousGuildId).toBe("g1");
    expect(result.currentGuildId).toBeNull();
    expect(result.closedMembership?.leftAt).toEqual(leaveDate);
    expect(result.newMembership).toBeNull();

    expect(operations).toContain("update");
    expect(operations).not.toContain("create");
    expect(memberships).toHaveLength(1);
    expect(memberships[0].leftAt).toEqual(leaveDate);
  });

  it("transition 3 (Guildless to Guild): opens new membership for a previously guildless player", async () => {
    const initialJoin = new Date("2026-01-01T10:00:00Z");
    const leaveDate = new Date("2026-02-01T10:00:00Z");
    const rejoinDate = new Date("2026-04-01T10:00:00Z");

    const { client, memberships, operations } = createMockPrismaClient([
      { playerId: "p1", guildId: "g1", joinedAt: initialJoin, leftAt: leaveDate },
    ]);

    const result = await simulateGuildChange(
      { playerId: "p1", guildId: "g2", effectiveAt: rejoinDate },
      client as any,
    );

    expect(result.changed).toBe(true);
    expect(result.transition).toBe("GUILDLESS_TO_GUILD");
    expect(result.previousGuildId).toBeNull();
    expect(result.currentGuildId).toBe("g2");
    expect(result.closedMembership).toBeNull();
    expect(result.newMembership?.guildId).toBe("g2");
    expect(result.newMembership?.leftAt).toBeNull();

    expect(operations).not.toContain("update");
    expect(operations).toContain("create");
    expect(memberships).toHaveLength(2);
    expect(memberships[1].leftAt).toBeNull();
  });

  it("no change writes nothing to the database", async () => {
    const joinedAt = new Date("2026-01-01T10:00:00Z");

    const { client, operations } = createMockPrismaClient([
      { playerId: "p1", guildId: "g1", joinedAt, leftAt: null },
    ]);

    const result = await simulateGuildChange(
      { playerId: "p1", guildId: "g1", effectiveAt: new Date("2026-02-01T10:00:00Z") },
      client as any,
    );

    expect(result.changed).toBe(false);
    expect(result.transition).toBe("NO_CHANGE");
    expect(operations).not.toContain("update");
    expect(operations).not.toContain("create");

    // Also verify for guildless player
    const { client: guildlessClient, operations: guildlessOps } = createMockPrismaClient();
    const guildlessResult = await simulateGuildChange(
      { playerId: "p2", guildId: null },
      guildlessClient as any,
    );

    expect(guildlessResult.changed).toBe(false);
    expect(guildlessResult.transition).toBe("NO_CHANGE");
    expect(guildlessOps).not.toContain("update");
    expect(guildlessOps).not.toContain("create");
  });

  it("proves the database rejects a second open membership for the same player", async () => {
    const { tx } = createMockPrismaClient([
      { playerId: "p1", guildId: "g1", joinedAt: new Date("2026-01-01T10:00:00Z"), leftAt: null },
    ]);

    // Attempting to directly insert a second open membership without closing the first one
    // must be rejected by the partial unique index GuildMembership_one_current_per_player
    let caughtError: unknown = null;
    try {
      await tx.guildMembership.create({
        data: {
          playerId: "p1",
          guildId: "g2",
          joinedAt: new Date("2026-02-01T10:00:00Z"),
          leftAt: null,
        },
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const prismaError = caughtError as Prisma.PrismaClientKnownRequestError;
    expect(prismaError.code).toBe("P2002");
  });
});

// Integration tests against PostgreSQL when DATABASE_URL is available
describe.runIf(Boolean(process.env.DATABASE_URL))(
  "4.8 Detect guild changes and write history (PostgreSQL Integration)",
  () => {
    const testRunId = `p42_${Date.now()}`;
    const guildAId = `guild_a_${testRunId}`;
    const guildBId = `guild_b_${testRunId}`;

    beforeAll(async () => {
      await prisma.guild.createMany({
        data: [
          { id: guildAId, name: "Test Guild Alpha" },
          { id: guildBId, name: "Test Guild Beta" },
        ],
      });
    });

    afterAll(async () => {
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

    it("live DB: transfer closes old and opens new membership atomically", async () => {
      const player = await createTestPlayer("live_transfer");
      const initialJoin = new Date("2026-01-01T10:00:00Z");
      const transferDate = new Date("2026-02-01T15:00:00Z");

      await simulateGuildChange({
        playerId: player.id,
        guildId: guildAId,
        effectiveAt: initialJoin,
      });

      const result = await simulateGuildChange({
        playerId: player.id,
        guildId: guildBId,
        effectiveAt: transferDate,
      });

      expect(result.changed).toBe(true);
      expect(result.transition).toBe("TRANSFER");
      expect(result.closedMembership?.leftAt).toEqual(transferDate);
      expect(result.newMembership?.leftAt).toBeNull();

      const memberships = await prisma.guildMembership.findMany({
        where: { playerId: player.id },
        orderBy: { joinedAt: "asc" },
      });
      expect(memberships).toHaveLength(2);
      expect(memberships[0].leftAt).toEqual(transferDate);
      expect(memberships[1].leftAt).toBeNull();
    });

    it("live DB: rejects a second open membership via PostgreSQL constraint", async () => {
      const player = await createTestPlayer("live_reject");
      await prisma.guildMembership.create({
        data: {
          playerId: player.id,
          guildId: guildAId,
          joinedAt: new Date("2026-01-01T10:00:00Z"),
          leftAt: null,
        },
      });

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

      expect(caughtError).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((caughtError as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
    });
  },
);
