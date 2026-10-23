import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const db = vi.hoisted(() => ({
  writeIngestBatch: vi.fn(),
  findMany: vi.fn(),
  disconnect: vi.fn(),
  store: { read: vi.fn(), write: vi.fn(), readBoundary: vi.fn(), writeBoundary: vi.fn() },
}));

vi.mock("@albion/db", () => ({
  prisma: { killEvent: { findMany: db.findMany }, $disconnect: db.disconnect },
  createWorkerStateStore: () => db.store,
  writeIngestBatch: db.writeIngestBatch,
}));
vi.mock("./worker.ts", async importOriginal => {
  const { createWorker } = await importOriginal<typeof import("./worker.ts")>();
  return { createWorker: (options: Parameters<typeof createWorker>[0]) => {
    const worker = createWorker(options);
    return { ...worker, run: async (signal: AbortSignal) => { await worker.runCycle(signal); } };
  } };
});

const event = (id: number, occurredAt = "2026-10-21T12:00:00Z") => ({
  EventId: id, TimeStamp: occurredAt, Killer: { Id: "k", Name: "K" },
  Victim: { Id: "v", Name: "V" }, Participants: [],
});

describe("worker entry point monitoring", () => {
  let log: MockInstance<typeof console.log>;
  let once: MockInstance<typeof process.once>;
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://unused.invalid/test");
    vi.stubEnv("ALBION_REGION", "europe");
    vi.stubEnv("DISCORD_WEBHOOK_URL", "");
    vi.stubEnv("ALBION_GAMEINFO_BASE_URL", "");
    db.store.read.mockResolvedValue({ consecutiveFailures: 0, alerted: false });
    db.store.readBoundary.mockResolvedValue(undefined);
    db.findMany.mockResolvedValue([]);
    db.writeIngestBatch.mockReset().mockImplementation(async (_batch, options) => {
      const result = { written: 1, skipped: 0 };
      options.onProgress(result);
      return result;
    });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([event(100)])));
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    once = vi.spyOn(process, "once");
  });
  afterEach(() => {
    for (const [signal, listener] of once.mock.calls) {
      if (signal === "SIGINT" || signal === "SIGTERM") process.removeListener(signal, listener);
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const report = () => log.mock.calls.map(([entry]) => JSON.parse(entry as string))
    .find(entry => entry.event === "ingestion.run");

  it("reports actual writes from events fetched with their raw payload", async () => {
    await import("./index.ts");
    expect(db.writeIngestBatch).toHaveBeenCalledOnce();
    expect(db.writeIngestBatch.mock.calls[0][0].events[0].raw).toMatchObject({ EventId: 100 });
    expect(report()).toMatchObject({ status: "success", written: 1 });
    expect(report().skipReasons).not.toHaveProperty("not_persisted");
    expect(db.disconnect).toHaveBeenCalledOnce();
  });

  it("separates mapping skips from database constraint skips", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([event(100), event(99, "invalid")])));
    db.writeIngestBatch.mockImplementation(async (_batch, options) => {
      const result = { written: 0, skipped: 1 };
      options.onProgress(result);
      return result;
    });
    await import("./index.ts");
    expect(report()).toMatchObject({ status: "success", written: 0, skipped: 2,
      skipReasons: { invalid_timestamp: 1, database_constraint: 1 } });
  });

  it("names write failures without advancing the scan boundary", async () => {
    db.writeIngestBatch.mockRejectedValue(new Error("Database unavailable"));
    await import("./index.ts");
    expect(report()).toMatchObject({ status: "failure", failedStage: "write", written: 0 });
    expect(db.store.writeBoundary).not.toHaveBeenCalled();
    expect(db.disconnect).toHaveBeenCalledOnce();
  });

  it("includes partial writes and constraint skips when the writer later rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([event(100), event(99), event(98)])));
    db.writeIngestBatch.mockImplementation(async (_batch, options) => {
      options.onProgress({ written: 1, skipped: 0 });
      options.onProgress({ written: 0, skipped: 1 });
      throw new Error("Database connection lost");
    });
    await import("./index.ts");
    expect(report()).toMatchObject({ status: "failure", failedStage: "write", fetched: 3, written: 1,
      skipped: 1, skipReasons: { database_constraint: 1 }, error: "Database connection lost" });
    expect(db.store.writeBoundary).not.toHaveBeenCalled();
  });
});
