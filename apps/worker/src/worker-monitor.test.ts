import { createAlbionClient, type AlbionFetch } from "@albion/albion-client";
import { describe, expect, it, vi } from "vitest";
import { createIngestionMonitor, type MonitorState, type RunReport } from "./monitor";
import { createWorker } from "./worker";

function event(id: number) {
  return { EventId: id, TimeStamp: "2026-10-13T12:00:00Z", Killer: { Id: "killer", Name: "Killer" },
    Victim: { Id: "victim", Name: "Victim" }, Participants: [] };
}

function response(status: number, data: unknown) {
  return { ok: status === 200, status, statusText: "Test", json: async () => data,
    arrayBuffer: async () => new ArrayBuffer(0) };
}

function stateStore() {
  let state: MonitorState = { consecutiveFailures: 0, alerted: false };
  let boundary: number | undefined;
  return {
    read: vi.fn(async () => ({ ...state })),
    write: vi.fn(async (next: typeof state) => { state = { ...next }; }),
    readBoundary: vi.fn(async () => boundary),
    writeBoundary: vi.fn(async (next: number) => { boundary = next; }),
  };
}

function setup(fetch: AlbionFetch, store = stateStore(), threshold = 3) {
  const reports: RunReport[] = [];
  const sendAlert = vi.fn(async (_report: RunReport) => {});
  const monitor = createIngestionMonitor({ region: "europe", store, failureThreshold: threshold,
    sendAlert, log: (entry) => { if (entry.event === "ingestion.run") reports.push(entry); } });
  const worker: ReturnType<typeof createWorker> = createWorker({
    client: createAlbionClient({ region: "europe", fetch, retry: { delaysMs: [0] }, onRetry: () => worker.onRetry() }).gameinfo,
    monitor, stateStore: store, intervalMs: 1, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    findExistingIds: async () => new Set(),
    onEvents: async (events, context) => { context?.skip("not_persisted", events.length); },
  });
  return { worker, reports, store, sendAlert };
}

describe("monitored worker", () => {
  it("forwards HTTP retries and logs real metrics without claiming database writes", async () => {
    let calls = 0;
    const { worker, reports } = setup(async () => ++calls === 1 ? response(502, null) : response(200, [event(100)]));
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ status: "success", fetched: 1, written: 0, skipped: 1,
      skipReasons: { not_persisted: 1 }, retries: 1, failedStage: null });
    expect(reports[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps consecutive failures and suppresses repeated alerts across restarts", async () => {
    const store = stateStore();
    for (let cycle = 1; cycle <= 4; cycle++) {
      const { worker, reports, sendAlert } = setup(async () => response(404, null), store);
      await worker.runCycle();
      expect(reports[0]).toMatchObject({ status: "failure", failedStage: "fetch", consecutiveFailures: cycle });
      expect(sendAlert).toHaveBeenCalledTimes(cycle === 3 ? 1 : 0);
    }
    await setup(async () => response(200, []), store).worker.runCycle();
    expect(await store.read()).toEqual({ consecutiveFailures: 0, alerted: false });
  });

  it("alerts within the first broken-URL cycle when the live-test threshold is one", async () => {
    const { worker, reports, sendAlert } = setup(async () => response(404, null), stateStore(), 1);
    await worker.runCycle();
    expect(sendAlert).toHaveBeenCalledOnce();
    expect(reports[0]).toMatchObject({ failedStage: "fetch", alertStatus: "sent", consecutiveFailures: 1 });
  });

  it("logs skip reasons for malformed and duplicate records", async () => {
    const { worker, reports } = setup(async () => response(200, [event(100), event(100), { EventId: 99 }]));
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ status: "success", fetched: 3, written: 0, skipped: 3,
      skipReasons: { malformed: 1, duplicate: 1, not_persisted: 1 } });
  });

  it("labels existing-ID lookup failures without advancing the boundary", async () => {
    const store = stateStore();
    const reports: RunReport[] = [];
    const worker = createWorker({
      client: createAlbionClient({ region: "europe", fetch: async () => response(200, [event(100)]) }).gameinfo,
      stateStore: store,
      monitor: createIngestionMonitor({ region: "europe", store,
        log: (entry) => { if (entry.event === "ingestion.run") reports.push(entry); } }),
      intervalMs: 1, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      findExistingIds: async () => { throw new Error("Database lookup unavailable"); }, onEvents: async () => {},
    });
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ status: "failure", failedStage: "existing_ids", fetched: 1 });
    expect(await store.readBoundary()).toBeUndefined();
  });

  it("does not overwrite durable state when its read fails", async () => {
    const store = stateStore();
    await store.write({ consecutiveFailures: 2, alerted: false });
    store.read.mockRejectedValueOnce(new Error("State read unavailable"));
    const fetch = vi.fn(async () => response(200, []));
    const { worker, reports } = setup(fetch, store);
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ status: "failure", failedStage: "monitor_state" });
    expect(await store.read()).toEqual({ consecutiveFailures: 2, alerted: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(store.write).toHaveBeenCalledTimes(1);
  });

  it("restores the scan boundary and stops at it after restarting", async () => {
    const store = stateStore();
    await setup(async () => response(200, [event(100)]), store).worker.runCycle();
    const offsets: number[] = [];
    const { worker, reports } = setup(async (url) => {
      offsets.push(Number(new URL(url).searchParams.get("offset")));
      return response(200, [event(150), event(100), ...Array.from({ length: 49 }, (_, i) => event(99 - i))]);
    }, store);
    await worker.runCycle();
    expect(offsets).toEqual([0]);
    expect(await store.readBoundary()).toBe(150);
    expect(reports[0].status).toBe("success");
  });

  it("counts actual missing-boundary warnings, alerts across restarts, then resets on a matching boundary", async () => {
    const store = stateStore();
    await store.writeBoundary(100);
    for (let run = 1; run <= 3; run++) {
      const { worker, reports, sendAlert } = setup(async () => response(200, [event(100 + run * 100)]), store);
      await worker.runCycle();
      expect(reports[0]).toMatchObject({ status: "success", boundaryMisses: 1, consecutiveBoundaryMisses: run,
        consecutiveFailures: 0, boundaryAlertStatus: run === 3 ? "sent" : "not-needed" });
      expect(sendAlert).toHaveBeenCalledTimes(run === 3 ? 1 : 0);
      if (run === 3) expect(sendAlert.mock.calls[0][0].alertType).toBe("polling_interval");
    }
    const { worker, reports, sendAlert } = setup(async () => response(200, [event(500), event(400)]), store);
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ boundaryMisses: 0, consecutiveBoundaryMisses: 0, boundaryAlertStatus: "not-needed" });
    expect(sendAlert).not.toHaveBeenCalled();
    expect(await store.read()).toMatchObject({ consecutiveBoundaryMisses: 0, boundaryAlerted: false });
  });

  it.each(["queued", "request", "handler", "feed"])("counts missing boundaries independently of %s recovery/handling", async (mode) => {
    const store = stateStore();
    await store.writeBoundary(100);
    await store.write({ consecutiveFailures: 0, alerted: false, consecutiveBoundaryMisses: 2, boundaryAlerted: false });
    const reports: RunReport[] = [];
    const sendAlert = vi.fn(async (_report: RunReport) => {});
    const recover = vi.fn(async () => mode === "request" ? response(404, null) : response(200, event(250)));
    let cycle = 0;
    const worker = createWorker({
      client: createAlbionClient({ region: "europe", retry: { delaysMs: [] }, fetch: async (url) => {
        if (new URL(url).pathname.endsWith("/events/250")) return recover();
        return response(200, cycle === 0 ? [event(300), { EventId: 250 }] : [event(350)]);
      } }).gameinfo,
      monitor: createIngestionMonitor({ region: "europe", store, sendAlert,
        log: (entry) => { if (entry.event === "ingestion.run") reports.push(entry); } }),
      stateStore: store, intervalMs: 1, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      findExistingIds: async () => new Set(),
      onEvents: async (events) => {
        if (mode === "feed" || (mode === "handler" && events.some(({ id }) => id === 250))) {
          throw new Error("Handler unavailable");
        }
      },
    });
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ boundaryMisses: 1, consecutiveBoundaryMisses: 3, boundaryAlertStatus: "sent" });
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ alertType: "polling_interval" }));
    expect(await store.readBoundary()).toBe(100);
    if (mode === "request" || mode === "handler") {
      cycle = 1;
      await worker.runCycle();
      expect(recover).toHaveBeenCalledOnce();
      expect(reports[1]).toMatchObject({ status: "failure", boundaryMisses: 1, consecutiveBoundaryMisses: 4,
        failedStage: mode === "request" ? "event_recovery" : "event_handler" });
      expect(await store.readBoundary()).toBe(100);
    }
  });

  it("does not report a missing boundary before any completed scan exists", async () => {
    const { worker, reports } = setup(async () => response(200, [event(100)]));
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ boundaryMisses: 0, consecutiveBoundaryMisses: 0 });
  });

  it("reports partial scan failures and does not advance the stored boundary", async () => {
    const store = stateStore();
    await store.writeBoundary(100);
    const { worker, reports } = setup(async (url) => new URL(url).searchParams.get("offset") === "0"
      ? response(200, Array.from({ length: 51 }, (_, i) => event(200 - i))) : response(404, null), store);
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ status: "failure", fetched: 51, failedStage: "fetch", consecutiveFailures: 1 });
    expect(await store.readBoundary()).toBe(100);
  });

  it("reports boundary storage failures and retries the write next cycle", async () => {
    const store = stateStore();
    store.writeBoundary.mockRejectedValueOnce(new Error("State database unavailable"));
    const { worker, reports } = setup(async () => response(200, [event(100)]), store);
    await worker.runCycle();
    expect(reports[0]).toMatchObject({ status: "failure", failedStage: "worker_state" });
    expect(await store.readBoundary()).toBeUndefined();
    await worker.runCycle();
    expect(await store.readBoundary()).toBe(100);
    expect(reports[1].status).toBe("success");
  });

  it("does not save a boundary past queued recovery and a failed recovery handler before restart", async () => {
    const store = stateStore();
    await store.writeBoundary(100);
    let cycle = 0;
    const handled: number[] = [];
    const recover = vi.fn(() => response(200, event(250)));
    const reports: RunReport[] = [];
    const create = () => createWorker({
      client: createAlbionClient({ region: "europe", retry: { delaysMs: [] }, fetch: async (url) => {
        if (new URL(url).pathname.endsWith("/events/250")) return recover();
        if (cycle === 0) return response(200, [event(300), { EventId: 250 }, event(100)]);
        const offset = Number(new URL(url).searchParams.get("offset"));
        return response(200, offset === 0
          ? [event(350), event(300), ...Array.from({ length: 49 }, (_, i) => event(299 - i))]
          : cycle === 1 ? [event(100)] : [event(250), event(100)]);
      } }).gameinfo,
      monitor: createIngestionMonitor({ region: "europe", store,
        log: (entry) => { if (entry.event === "ingestion.run") reports.push(entry); } }), stateStore: store,
      intervalMs: 1, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      findExistingIds: async () => new Set(),
      onEvents: async (events) => {
        if (cycle === 1 && events.some(({ id }) => id === 250)) throw new Error("Recovered event handler failed");
        handled.push(...events.map(({ id }) => id));
      },
    });
    const worker = create();
    await worker.runCycle();
    expect(await store.readBoundary()).toBe(100);
    cycle = 1;
    await worker.runCycle();
    expect(recover).toHaveBeenCalledOnce();
    expect(reports[1]).toMatchObject({ status: "failure", failedStage: "event_handler" });
    expect(handled).toContain(350);
    expect(await store.readBoundary()).toBe(100);
    expect(handled).not.toContain(250);
    cycle = 2;
    await create().runCycle();
    expect(handled).toContain(250);
    expect(await store.readBoundary()).toBe(350);
  });

  it("does not clear or increment an incident on graceful shutdown", async () => {
    const store = stateStore();
    await store.write({ consecutiveFailures: 2, alerted: false });
    const controller = new AbortController();
    const { worker, reports, sendAlert } = setup(async () => {
      controller.abort();
      return response(200, []);
    }, store);
    await worker.runCycle(controller.signal);
    expect(reports[0].status).toBe("cancelled");
    expect(await store.read()).toEqual({ consecutiveFailures: 2, alerted: false });
    expect(sendAlert).not.toHaveBeenCalled();
  });
});
