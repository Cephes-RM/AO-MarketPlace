import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ prisma: {} }));
import { createWorkerStateStore } from "./worker-state";

function database() {
  const rows = new Map<string, { region: string; consecutiveFailures: number; alerted: boolean;
    consecutiveBoundaryMisses?: number; boundaryAlerted?: boolean; scanBoundary: bigint | null;
    lastFeedEventId?: bigint; lastNewEventAt?: Date; feedStallAlerted?: boolean }>();
  const delegate = {
    findUnique: vi.fn(async ({ where }: { where: { region: string } }) => rows.get(where.region) ?? null),
    upsert: vi.fn(async ({ where, create, update }: {
      where: { region: string };
      create: { region: string; consecutiveFailures?: number; alerted?: boolean;
        consecutiveBoundaryMisses?: number; boundaryAlerted?: boolean; scanBoundary?: bigint;
        lastFeedEventId?: bigint; lastNewEventAt?: Date; feedStallAlerted?: boolean };
      update: { consecutiveFailures?: number; alerted?: boolean;
        consecutiveBoundaryMisses?: number; boundaryAlerted?: boolean; scanBoundary?: bigint;
        lastFeedEventId?: bigint; lastNewEventAt?: Date; feedStallAlerted?: boolean };
    }) => {
      const previous = rows.get(where.region);
      const next = previous ? { ...previous, ...update }
        : { consecutiveFailures: 0, alerted: false, scanBoundary: null, ...create };
      rows.set(where.region, next);
      return next;
    }),
  };
  return { rows, delegate: delegate as unknown as NonNullable<Parameters<typeof createWorkerStateStore>[1]> };
}

describe("database worker state", () => {
  it("restores monitor state and boundary without either update overwriting the other", async () => {
    const db = database();
    const store = createWorkerStateStore("europe", db.delegate);
    expect(await store.read()).toEqual({ consecutiveFailures: 0, alerted: false,
      consecutiveBoundaryMisses: 0, boundaryAlerted: false });
    expect(await store.readBoundary()).toBeUndefined();
    await store.write({ consecutiveFailures: 3, alerted: true });
    await store.writeBoundary(445846927);
    const restarted = createWorkerStateStore("europe", db.delegate);
    expect(await restarted.read()).toEqual({ consecutiveFailures: 3, alerted: true,
      consecutiveBoundaryMisses: 0, boundaryAlerted: false });
    expect(await restarted.readBoundary()).toBe(445846927);
    await restarted.write({ consecutiveFailures: 0, alerted: false });
    expect(await restarted.readBoundary()).toBe(445846927);
    expect(db.rows.size).toBe(1);
  });

  it("restores the independent boundary incident without overwriting the scan boundary", async () => {
    const db = database();
    const store = createWorkerStateStore("europe", db.delegate);
    await store.writeBoundary(100);
    await store.write({ consecutiveFailures: 0, alerted: false, consecutiveBoundaryMisses: 3, boundaryAlerted: true });
    const restarted = createWorkerStateStore("europe", db.delegate);
    expect(await restarted.read()).toEqual({ consecutiveFailures: 0, alerted: false,
      consecutiveBoundaryMisses: 3, boundaryAlerted: true });
    expect(await restarted.readBoundary()).toBe(100);
    await restarted.writeBoundary(200);
    expect(await restarted.read()).toMatchObject({ consecutiveBoundaryMisses: 3, boundaryAlerted: true });
    await restarted.write({ consecutiveFailures: 0, alerted: false, consecutiveBoundaryMisses: 0, boundaryAlerted: false });
    expect(await restarted.read()).toMatchObject({ consecutiveBoundaryMisses: 0, boundaryAlerted: false });
    expect(await restarted.readBoundary()).toBe(200);
  });

  it("restores feed activity across restarts independently of the scan boundary", async () => {
    const db = database();
    const store = createWorkerStateStore("europe", db.delegate);
    const activity = { lastFeedEventId: 200, lastNewEventAt: 1_792_310_400_000, feedStallAlerted: true };
    await store.writeBoundary(100);
    await store.write({ consecutiveFailures: 0, alerted: false, ...activity });
    const restarted = createWorkerStateStore("europe", db.delegate);
    expect(await restarted.read()).toMatchObject(activity);
    expect(await restarted.readBoundary()).toBe(100);
    await restarted.writeBoundary(300);
    expect(await restarted.read()).toMatchObject(activity);
    expect(await createWorkerStateStore("west", db.delegate).read()).not.toHaveProperty("lastFeedEventId");
  });

  it("rejects invalid activity before writing or restoring it", async () => {
    const db = database();
    const store = createWorkerStateStore("europe", db.delegate);
    await expect(store.write({ consecutiveFailures: 0, alerted: false, lastFeedEventId: -1 })).rejects.toThrow("feed event ID");
    await expect(store.write({ consecutiveFailures: 0, alerted: false, lastNewEventAt: Number.MAX_SAFE_INTEGER })).rejects.toThrow("activity time");
    expect(db.delegate.upsert).not.toHaveBeenCalled();
    db.rows.set("europe", { region: "europe", consecutiveFailures: 0, alerted: false, scanBoundary: null,
      lastFeedEventId: 9007199254740993n });
    await expect(store.read()).rejects.toThrow("feed event ID");
  });

  it("keeps server regions separate", async () => {
    const db = database();
    await createWorkerStateStore("europe", db.delegate).writeBoundary(100);
    await createWorkerStateStore("west", db.delegate).writeBoundary(200);
    expect(await createWorkerStateStore("europe", db.delegate).readBoundary()).toBe(100);
    expect(await createWorkerStateStore("west", db.delegate).readBoundary()).toBe(200);
  });

  it("rejects invalid boundaries before writing and when restoring", async () => {
    const db = database();
    const store = createWorkerStateStore("europe", db.delegate);
    await expect(store.writeBoundary(-1)).rejects.toThrow("Invalid ingestion scan boundary");
    expect(db.delegate.upsert).not.toHaveBeenCalled();
    db.rows.set("europe", { region: "europe", consecutiveFailures: 0, alerted: false, scanBoundary: 9007199254740993n });
    await expect(store.readBoundary()).rejects.toThrow("Invalid ingestion scan boundary");
  });
});
