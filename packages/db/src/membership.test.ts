import {
  PrismaClientKnownRequestError,
} from "@prisma/client/runtime/library";
import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ prisma: {} }));
import { syncGuildMembership } from "./membership";

// ─── In-memory DB stub ────────────────────────────────────────────────────────

type MembershipRow = {
  playerId: string;
  guildId: string;
  joinedAt: Date;
  leftAt: Date | null;
};

/**
 * Minimal in-memory stand-in for the Prisma `guildMembership` table.
 *
 * Enforces the schema PK  @@id([playerId, guildId, joinedAt])
 * so a second open row for the same (playerId, guildId, joinedAt) triple is
 * rejected — exactly as the real database would do.
 */
function makeDb() {
  const rows: MembershipRow[] = [];

  const guildMembership = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        rows.find(
          (r) =>
            r.playerId === where.playerId &&
            (where.leftAt === null ? r.leftAt === null : true),
        ) ?? null
      );
    }),

    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { playerId_guildId_joinedAt: { playerId: string; guildId: string; joinedAt: Date } };
        data: { leftAt: Date };
      }) => {
        const { playerId, guildId, joinedAt } = where.playerId_guildId_joinedAt;
        const row = rows.find(
          (r) =>
            r.playerId === playerId &&
            r.guildId === guildId &&
            r.joinedAt.getTime() === joinedAt.getTime(),
        );
        if (!row) throw new Error("Row not found for update");
        row.leftAt = data.leftAt;
        return row;
      },
    ),

    create: vi.fn(
      async ({
        data,
      }: {
        data: { playerId: string; guildId: string; joinedAt: Date };
      }) => {
        // Enforce the composite PK — same triple must not already exist.
        const duplicate = rows.find(
          (r) =>
            r.playerId === data.playerId &&
            r.guildId === data.guildId &&
            r.joinedAt.getTime() === data.joinedAt.getTime(),
        );
        if (duplicate) {
          throw new PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`playerId`,`guildId`,`joinedAt`)",
            { code: "P2002", clientVersion: "test" },
          );
        }
        // Enforce the partial unique index: at most one open membership per player.
        const openDuplicate = rows.find(
          (r) => r.playerId === data.playerId && r.leftAt === null,
        );
        if (openDuplicate) {
          throw new PrismaClientKnownRequestError(
            "Unique constraint failed on the partial index: (`playerId`) WHERE \"leftAt\" IS NULL",
            { code: "P2002", clientVersion: "test" },
          );
        }
        const row: MembershipRow = { ...data, leftAt: null };
        rows.push(row);
        return row;
      },
    ),
  };

  return { rows, guildMembership };
}

// Helper: build a client shaped like the Prisma interactive-tx client.
function txOf(db: ReturnType<typeof makeDb>) {
  return { guildMembership: db.guildMembership } as unknown as Parameters<
    typeof syncGuildMembership
  >[0];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-06-01T00:00:00Z");
const T2 = new Date("2026-10-01T00:00:00Z");

describe("syncGuildMembership", () => {
  // ── Scenario 1: first-seen player joins a guild ──────────────────────────

  it("opens an initial membership for a first-seen player with a guild", async () => {
    const db = makeDb();
    await syncGuildMembership(txOf(db), "player-1", "guild-a", T0);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toEqual({
      playerId: "player-1",
      guildId: "guild-a",
      joinedAt: T0,
      leftAt: null,
    });
  });

  it("does nothing for a first-seen player that is guildless", async () => {
    const db = makeDb();
    await syncGuildMembership(txOf(db), "player-x", null, T0);

    expect(db.rows).toHaveLength(0);
  });

  // ── Scenario 2: guild-to-guild transfer ─────────────────────────────────

  it("closes the old membership and opens a new one when the player changes guild", async () => {
    const db = makeDb();
    // Seed an open membership in guild-a.
    db.rows.push({ playerId: "player-1", guildId: "guild-a", joinedAt: T0, leftAt: null });

    await syncGuildMembership(txOf(db), "player-1", "guild-b", T1);

    expect(db.rows).toHaveLength(2);
    expect(db.rows[0]).toEqual({
      playerId: "player-1",
      guildId: "guild-a",
      joinedAt: T0,
      leftAt: T1, // closed at the transition timestamp
    });
    expect(db.rows[1]).toEqual({
      playerId: "player-1",
      guildId: "guild-b",
      joinedAt: T1,
      leftAt: null, // new open membership
    });
  });

  // ── Scenario 3: guild → guildless ────────────────────────────────────────

  it("closes the old membership and writes nothing when the player leaves all guilds", async () => {
    const db = makeDb();
    db.rows.push({ playerId: "player-1", guildId: "guild-a", joinedAt: T0, leftAt: null });

    await syncGuildMembership(txOf(db), "player-1", null, T1);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].leftAt).toEqual(T1); // old membership closed
  });

  // ── Scenario 4: guildless → guild ────────────────────────────────────────

  it("opens a membership when a previously guildless player joins a guild", async () => {
    const db = makeDb();
    // Player exists but has no open membership (all past memberships closed).
    db.rows.push({ playerId: "player-1", guildId: "guild-a", joinedAt: T0, leftAt: T1 });

    await syncGuildMembership(txOf(db), "player-1", "guild-b", T2);

    expect(db.rows).toHaveLength(2);
    expect(db.rows[1]).toEqual({
      playerId: "player-1",
      guildId: "guild-b",
      joinedAt: T2,
      leftAt: null,
    });
    // The previously closed row must remain untouched.
    expect(db.rows[0].leftAt).toEqual(T1);
  });

  // ── Idempotence ──────────────────────────────────────────────────────────

  it("is a no-op when the player's guild has not changed", async () => {
    const db = makeDb();
    db.rows.push({ playerId: "player-1", guildId: "guild-a", joinedAt: T0, leftAt: null });

    await syncGuildMembership(txOf(db), "player-1", "guild-a", T1);

    expect(db.rows).toHaveLength(1); // no new row
    expect(db.rows[0].leftAt).toBeNull(); // still open
    expect(db.guildMembership.update).not.toHaveBeenCalled();
    expect(db.guildMembership.create).not.toHaveBeenCalled();
  });

  it("is a no-op for a guildless player that is still guildless", async () => {
    const db = makeDb();

    await syncGuildMembership(txOf(db), "player-1", null, T0);
    await syncGuildMembership(txOf(db), "player-1", null, T1);

    expect(db.rows).toHaveLength(0);
    expect(db.guildMembership.create).not.toHaveBeenCalled();
  });

  // ── Stale observation guard ──────────────────────────────────────────────

  it("does not overwrite a newer open membership when a stale observation arrives", async () => {
    const db = makeDb();
    // Player joined guild-b at T1 and is currently still there (open membership).
    db.rows.push({ playerId: "player-1", guildId: "guild-b", joinedAt: T1, leftAt: null });

    // A stale fight from T0 arrives showing the old guild-a.
    await syncGuildMembership(txOf(db), "player-1", "guild-a", T0);

    // The newer open membership in guild-b must remain untouched.
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toEqual({
      playerId: "player-1",
      guildId: "guild-b",
      joinedAt: T1,
      leftAt: null,
    });
    expect(db.guildMembership.update).not.toHaveBeenCalled();
    expect(db.guildMembership.create).not.toHaveBeenCalled();
  });

  it("does not close an open membership when a stale observation shows the player as guildless", async () => {
    const db = makeDb();
    db.rows.push({ playerId: "player-1", guildId: "guild-b", joinedAt: T1, leftAt: null });

    // A stale fight from T0 arrives showing the player was guildless.
    await syncGuildMembership(txOf(db), "player-1", null, T0);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].leftAt).toBeNull();
    expect(db.guildMembership.update).not.toHaveBeenCalled();
    expect(db.guildMembership.create).not.toHaveBeenCalled();
  });

  // ── DB constraint: second open membership is rejected ────────────────────

  it("rejects a second open membership for the same (playerId, guildId, joinedAt) triple", async () => {
    const db = makeDb();
    // Insert a row with the exact same PK we will try to create again.
    db.rows.push({ playerId: "player-1", guildId: "guild-a", joinedAt: T0, leftAt: null });

    // Bypass syncGuildMembership and call create directly to prove the DB stub
    // enforces the constraint independently of the business logic.
    await expect(
      db.guildMembership.create({
        data: { playerId: "player-1", guildId: "guild-a", joinedAt: T0 },
      }),
    ).rejects.toThrow(PrismaClientKnownRequestError);
  });

  it("rejects a second open membership for the same player via partial unique index", async () => {
    const db = makeDb();
    db.rows.push({ playerId: "player-1", guildId: "guild-a", joinedAt: T0, leftAt: null });

    await expect(
      db.guildMembership.create({
        data: { playerId: "player-1", guildId: "guild-b", joinedAt: T1 },
      }),
    ).rejects.toThrow(PrismaClientKnownRequestError);
  });
});
