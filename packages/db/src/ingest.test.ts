import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
} from "@prisma/client/runtime/library";
import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ prisma: {} }));
import { isConstraintError, writeIngestBatch, type IngestBatch } from "./ingest";

type Row = Record<string, unknown>;
type Args = { where: Row; create: Row; update: Row };

function knownError(code: string) {
  return new PrismaClientKnownRequestError(`Simulated ${code}`, { code, clientVersion: "test" });
}

/** In-memory stand-in for the Prisma client that enforces the schema's foreign keys. */
function database() {
  const tables = {
    alliance: new Map<string, Row>(),
    guild: new Map<string, Row>(),
    player: new Map<string, Row>(),
    killEvent: new Map<string, Row>(),
    killParticipant: new Map<string, Row>(),
  };
  const calls: string[] = [];
  const requireRow = (table: keyof typeof tables, id: unknown) => {
    if (id !== null && !tables[table].has(String(id))) throw knownError("P2003");
  };
  const delegate = (table: keyof typeof tables, keyOf: (where: Row) => string, check: (row: Row) => void) => ({
    upsert: vi.fn(async ({ where, create, update }: Args) => {
      const key = keyOf(where);
      calls.push(`${table}:${key}`);
      const existing = tables[table].get(key);
      const row = existing ? { ...existing, ...update } : { ...create };
      check(row);
      tables[table].set(key, row);
      return row;
    }),
  });
  const client = {
    alliance: delegate("alliance", (where) => String(where.id), () => {}),
    guild: delegate("guild", (where) => String(where.id), (row) => requireRow("alliance", row.allianceId)),
    player: delegate("player", (where) => String(where.id), () => {}),
    killEvent: delegate("killEvent", (where) => String(where.id), (row) => {
      requireRow("player", row.killerId);
      requireRow("player", row.victimId);
    }),
    killParticipant: delegate("killParticipant", (where) => {
      const key = where.killEventId_playerId as Row;
      return `${key.killEventId}:${key.playerId}`;
    }, (row) => {
      requireRow("killEvent", row.killEventId);
      requireRow("player", row.playerId);
    }),
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => {
      const events = new Map(tables.killEvent);
      const participants = new Map(tables.killParticipant);
      try {
        return await work(client);
      } catch (error) {
        tables.killEvent = events;
        tables.killParticipant = participants;
        throw error;
      }
    }),
  };
  const snapshot = () => Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, Object.fromEntries(rows)]),
  );
  return {
    tables,
    calls,
    snapshot,
    client: client as unknown as NonNullable<Parameters<typeof writeIngestBatch>[1]["client"]>,
  };
}

function logger() {
  return { warn: vi.fn() };
}

function sampleBatch(): IngestBatch {
  const event = {
    raw: { EventId: 2, Killer: { Id: "killer" } },
    battleId: "900",
    occurredAt: new Date("2026-09-25T12:00:00.000Z"),
    location: null,
    totalFame: 12_345n,
    killerItemPower: 1300.5,
    victimItemPower: 1100,
    killerLoadout: { main_hand: { id: "T8_MAIN_SWORD", quality: 4, count: 1 } },
    victimLoadout: {},
  };
  return {
    alliances: [{ id: "alliance", name: "Alliance" }],
    guilds: [
      { id: "guild", name: "Guild", allianceId: "alliance" },
      { id: "solo-guild", name: "Solo Guild", allianceId: null },
    ],
    players: [
      { id: "killer", name: "Killer", region: "europe" },
      { id: "victim", name: "Victim", region: "europe" },
      { id: "helper", name: "Helper", region: "europe" },
    ],
    events: [
      {
        ...event,
        id: "1",
        killerId: "killer",
        victimId: "victim",
        participants: [
          { playerId: "killer", damageDone: 900, healingDone: 0, killFame: 6000n, isPrimary: true,
            itemPower: 1300.5, loadout: { body: { id: "T8_ARMOR_PLATE_SET1" } } },
          { playerId: "helper", damageDone: 100, healingDone: 50, killFame: 6000n, isPrimary: false,
            itemPower: null, loadout: {} },
        ],
      },
      { ...event, id: "2", killerId: "helper", victimId: "victim", participants: [] },
    ],
  };
}

describe("writeIngestBatch", () => {
  it("reports committed progress before a later transaction fails and rethrows the original error", async () => {
    const db = database();
    const failure = new Error("Database connection lost");
    const transaction = vi.mocked(db.client.$transaction).getMockImplementation()!;
    let transactions = 0;
    vi.mocked(db.client.$transaction).mockImplementation((async (...args: Parameters<typeof transaction>) => {
      if (++transactions === 2) throw failure;
      return transaction(...args);
    }) as typeof transaction);
    const onProgress = vi.fn();
    await expect(writeIngestBatch(sampleBatch(), { client: db.client, logger: logger(), onProgress }))
      .rejects.toBe(failure);
    expect([...db.tables.killEvent.keys()]).toEqual(["1"]);
    expect(onProgress).toHaveBeenCalledExactlyOnceWith({ written: 1, skipped: 0 });
  });

  it("writes alliances, guilds, players, events, then participants", async () => {
    const db = database();
    await expect(writeIngestBatch(sampleBatch(), { logger: logger(), client: db.client }))
      .resolves.toEqual({ written: 2, skipped: 0 });

    expect(db.calls).toEqual([
      "alliance:alliance",
      "guild:guild",
      "guild:solo-guild",
      "player:killer",
      "player:victim",
      "player:helper",
      "killEvent:1",
      "killParticipant:1:killer",
      "killParticipant:1:helper",
      "killEvent:2",
    ]);
    expect(db.tables.killEvent.get("1")).toMatchObject({
      raw: { EventId: 2, Killer: { Id: "killer" } },
      battleId: "900",
      occurredAt: new Date("2026-09-25T12:00:00.000Z"),
      killerLoadout: { main_hand: { id: "T8_MAIN_SWORD", quality: 4, count: 1 } },
    });
    expect(db.tables.killParticipant.get("1:killer")).toMatchObject({
      killEventId: "1", playerId: "killer", isPrimary: true, loadout: { body: { id: "T8_ARMOR_PLATE_SET1" } },
    });
  });

  it("leaves the data unchanged when the same batch is written twice", async () => {
    const db = database();
    await writeIngestBatch(sampleBatch(), { logger: logger(), client: db.client });
    const first = structuredClone(db.snapshot());

    await expect(writeIngestBatch(sampleBatch(), { logger: logger(), client: db.client }))
      .resolves.toEqual({ written: 2, skipped: 0 });
    expect(db.snapshot()).toEqual(first);
    expect(db.tables.killParticipant.size).toBe(2);
  });

  it("creates fight-only players with zero fame and never updates stored fame", async () => {
    const db = database();
    db.tables.player.set("killer", {
      id: "killer", name: "Old name", region: "europe", fame: 10n, killFame: 7n, deathFame: 3n,
    });

    await writeIngestBatch(sampleBatch(), { logger: logger(), client: db.client });

    expect(db.tables.player.get("killer")).toEqual({
      id: "killer", name: "Killer", region: "europe", fame: 10n, killFame: 7n, deathFame: 3n,
    });
    expect(db.tables.player.get("victim")).toEqual({
      id: "victim", name: "Victim", region: "europe", fame: 0n, killFame: 0n, deathFame: 0n,
    });
    const playerUpsert = db.client.player.upsert as unknown as ReturnType<typeof vi.fn>;
    for (const [args] of playerUpsert.mock.calls) expect(Object.keys(args.update)).toEqual(["name"]);
  });

  it("keeps the last seen alliance and guild names", async () => {
    const db = database();
    db.tables.alliance.set("alliance", { id: "alliance", name: "Old alliance" });
    db.tables.guild.set("guild", { id: "guild", name: "Old guild", allianceId: null });

    await writeIngestBatch(sampleBatch(), { logger: logger(), client: db.client });

    expect(db.tables.alliance.get("alliance")).toEqual({ id: "alliance", name: "Alliance" });
    expect(db.tables.guild.get("guild")).toEqual({ id: "guild", name: "Guild", allianceId: "alliance" });
  });

  it("logs and skips an event that violates a constraint, rolling back its partial rows", async () => {
    const db = database();
    const log = logger();
    const batch = sampleBatch();
    batch.players = batch.players.filter((player) => player.id !== "helper");
    const onProgress = vi.fn();

    await expect(writeIngestBatch(batch, { logger: log, client: db.client, onProgress }))
      .resolves.toEqual({ written: 0, skipped: 2 });
    expect(db.tables.killEvent.size).toBe(0);
    expect(db.tables.killParticipant.size).toBe(0);
    expect(onProgress.mock.calls).toEqual([[{ written: 0, skipped: 1 }], [{ written: 0, skipped: 1 }]]);
    expect(log.warn).toHaveBeenCalledWith(
      "Skipped kill event that violates a database constraint.",
      { id: "1", code: "P2003" },
    );

    batch.events[0].participants.pop();
    await expect(writeIngestBatch(batch, { logger: log, client: db.client }))
      .resolves.toEqual({ written: 1, skipped: 1 });
    expect([...db.tables.killEvent.keys()]).toEqual(["1"]);
  });

  it("logs and skips an alliance, guild, or player row that violates a constraint", async () => {
    const db = database();
    const log = logger();
    const batch = sampleBatch();
    batch.guilds.push({ id: "orphan", name: "Orphan", allianceId: "missing-alliance" });

    await expect(writeIngestBatch(batch, { logger: log, client: db.client }))
      .resolves.toEqual({ written: 2, skipped: 0 });
    expect(db.tables.guild.has("orphan")).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      "Skipped guild that violates a database constraint.",
      { id: "orphan", code: "P2003" },
    );
  });

  it.each([
    ["a lost connection", new PrismaClientInitializationError("Can't reach database server", "test")],
    ["a pool timeout", knownError("P2024")],
    ["a transaction conflict", knownError("P2034")],
    ["an unexpected error", new Error("socket hang up")],
  ])("rethrows %s so the worker retries the batch", async (_, failure) => {
    const db = database();
    vi.mocked(db.client.player.upsert).mockRejectedValueOnce(failure);

    await expect(writeIngestBatch(sampleBatch(), { logger: logger(), client: db.client }))
      .rejects.toBe(failure);
    expect(db.tables.killEvent.size).toBe(0);
  });
});

describe("isConstraintError", () => {
  it("accepts only errors caused by the row's own data", () => {
    expect(isConstraintError(knownError("P2002"))).toBe(true);
    expect(isConstraintError(knownError("P2003"))).toBe(true);
    expect(isConstraintError(knownError("P2024"))).toBe(false);
    expect(isConstraintError(new PrismaClientInitializationError("down", "test"))).toBe(false);
    expect(isConstraintError(Object.assign(new Error("P2003"), { code: "P2003" }))).toBe(false);
  });
});
