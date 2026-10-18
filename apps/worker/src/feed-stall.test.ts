import { describe, expect, it, vi } from "vitest";
import { createAlbionClient } from "@albion/albion-client";
import { createIngestionMonitor, memoryStateStore, type RunReport } from "./monitor";
import { createWorker } from "./worker";
import { discordNotifier } from "./discord";

const HOUR = 3_600_000;
const START = Date.parse("2026-10-18T12:00:00Z");

function harness() {
  let clock = START;
  let id: number | undefined = 100;
  const store = memoryStateStore();
  const alerts: RunReport[] = [];
  const reports: RunReport[] = [];
  const create = (onEvents = () => {}) => {
    const monitor = createIngestionMonitor({ region: "europe", store, now: () => clock,
      sendAlert: async report => { alerts.push(report); },
      log: entry => { if (entry.event === "ingestion.run") reports.push(entry); } });
    return createWorker({ monitor, intervalMs: 1,
      client: createAlbionClient({ region: "europe", fetch: async () => ({ ok: true, status: 200, statusText: "OK",
        json: async () => id === undefined ? [] : [{ EventId: id, TimeStamp: new Date(clock - HOUR).toISOString(),
          Killer: { Id: "k", Name: "K" }, Victim: { Id: "v", Name: "V" }, Participants: [] }],
        arrayBuffer: async () => new ArrayBuffer(0) }) }).gameinfo,
      findExistingIds: async () => new Set(), onEvents: async () => { onEvents(); },
      logger: { info() {}, warn() {}, error() {} },
    });
  };
  return { create, store, alerts, reports, at: (elapsed: number) => { clock = START + elapsed; },
    feed: (next?: number) => { id = next; } };
}

describe("feed-stall monitoring", () => {
  it.each(["repeated", "empty"])("alerts only after two hours with a %s stalled feed, across restarts", async mode => {
    const h = harness();
    await h.create().runCycle();
    if (mode === "empty") h.feed(undefined);
    h.at(HOUR);
    await h.create().runCycle();
    expect(h.alerts).toHaveLength(0);
    h.at(2 * HOUR - 1);
    await h.create().runCycle();
    expect(h.alerts).toHaveLength(0);
    h.at(2 * HOUR);
    await h.create().runCycle();
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ alertType: "feed_stall", status: "success", feedIdleMs: 2 * HOUR });
    h.at(3 * HOUR);
    await h.create().runCycle();
    expect(h.alerts).toHaveLength(1);
    expect(h.reports.at(-1)).toMatchObject({ feedStallAlertStatus: "already-sent" });
    h.feed(200);
    await h.create().runCycle();
    expect(h.reports.at(-1)).toMatchObject({ feedIdleMs: 0, feedStallAlertStatus: "not-needed" });
    h.at(5 * HOUR);
    await h.create().runCycle();
    expect(h.alerts).toHaveLength(2);
  });

  it("does not alert while new events keep arriving sixty minutes behind", async () => {
    const h = harness();
    for (let cycle = 0; cycle <= 100; cycle++) {
      h.at(cycle * 120_000);
      h.feed(100 + cycle);
      await h.create().runCycle();
      expect(h.reports.at(-1)).toMatchObject({ feedIdleMs: 0 });
    }
    expect(h.alerts).toHaveLength(0);
    expect(await h.store.read()).toMatchObject({ lastFeedEventId: 200, feedStallAlerted: false });
  });

  it("does not reset feed activity when a queued malformed event recovers through getEvent", async () => {
    let now = START;
    const store = memoryStateStore();
    const reports: RunReport[] = [];
    const event = (id: number) => ({ EventId: id, TimeStamp: new Date(START).toISOString(),
      Killer: { Id: "k", Name: "K" }, Victim: { Id: "v", Name: "V" }, Participants: [] });
    const fetch = vi.fn(async (url: string) => ({ ok: true, status: 200, statusText: "OK",
      json: async () => url.includes("/events/200") ? event(200)
        : now === START ? [{ EventId: 200 }] : [event(100)],
      arrayBuffer: async () => new ArrayBuffer(0) }));
    const client = createAlbionClient({ region: "europe", fetch }).gameinfo;
    const getEvent = vi.spyOn(client, "getEvent");
    const onEvents = vi.fn();
    const worker = createWorker({ client, intervalMs: 1, findExistingIds: async () => new Set(), onEvents,
      logger: { info() {}, warn() {}, error() {} },
      monitor: createIngestionMonitor({ region: "europe", store, now: () => now, sendAlert: vi.fn(),
        log: report => { if (report.event === "ingestion.run") reports.push(report); } }) });
    await worker.runCycle();
    expect(getEvent).not.toHaveBeenCalled();
    now += 2 * HOUR;
    await worker.runCycle();
    expect(getEvent).toHaveBeenCalledWith(200, expect.any(AbortSignal));
    expect(onEvents.mock.calls.some(([events]) => events.some((entry: { id: number }) => entry.id === 200))).toBe(true);
    expect(reports.at(-1)).toMatchObject({ feedIdleMs: 2 * HOUR, feedStallAlertStatus: "sent" });
    expect(await store.read()).toMatchObject({ lastFeedEventId: 200, lastNewEventAt: START });
  });

  it("does not invent feed inactivity from failed requests", async () => {
    let now = START;
    const store = memoryStateStore();
    const monitor = createIngestionMonitor({ region: "europe", store, now: () => now, log() {} });
    await monitor.run(async context => { context.feed(100); });
    const saved = await store.read();
    now += 3 * HOUR;
    expect(await monitor.run(async context => { await context.stage("fetch", () => { throw new Error("API down"); }); }))
      .toMatchObject({ status: "failure", feedStallAlertStatus: "not-needed" });
    expect(await store.read()).toMatchObject({ lastFeedEventId: saved.lastFeedEventId, lastNewEventAt: saved.lastNewEventAt });
  });

  it.each([false, true])("persists arrivals on shutdown without changing other incidents (previous alert: %s)", async feedStallAlerted => {
    const h = harness();
    await h.create().runCycle();
    await h.store.write({ ...await h.store.read(), consecutiveFailures: 2, alerted: true,
      consecutiveBoundaryMisses: 2, boundaryAlerted: true, feedStallAlerted });
    h.at(119 * 60_000);
    h.feed(200);
    const controller = new AbortController();
    await h.create(() => controller.abort()).runCycle(controller.signal);
    expect(h.reports.at(-1)).toMatchObject({ status: "cancelled", alertStatus: "not-needed",
      boundaryAlertStatus: "not-needed", feedStallAlertStatus: "not-needed" });
    expect(h.alerts).toHaveLength(0);
    expect(await h.store.read()).toMatchObject({ lastFeedEventId: 200, lastNewEventAt: START + 119 * 60_000,
      feedStallAlerted: false, consecutiveFailures: 2, alerted: true, consecutiveBoundaryMisses: 2, boundaryAlerted: true });
    h.at(2 * HOUR);
    h.feed(undefined);
    await h.create().runCycle();
    expect(h.reports.at(-1)).toMatchObject({ feedIdleMs: 60_000, feedStallAlertStatus: "not-needed" });
    expect(h.alerts).toHaveLength(0);
    h.at(119 * 60_000 + 2 * HOUR);
    await h.create().runCycle();
    expect(h.alerts).toHaveLength(1);
    expect(h.alerts[0]).toMatchObject({ alertType: "feed_stall" });
  });

  it("retains cancelled-run activity locally if saving it fails, then retries persistence", async () => {
    let now = START;
    const backing = memoryStateStore();
    const write = vi.fn(backing.write);
    const monitor = createIngestionMonitor({ region: "europe", now: () => now,
      store: { read: backing.read, write }, log() {}, sendAlert: vi.fn() });
    await monitor.run(async context => { context.feed(100); });
    now += 119 * 60_000;
    write.mockRejectedValueOnce(new Error("Database unavailable"));
    const controller = new AbortController();
    expect(await monitor.run(async context => { context.feed(200); controller.abort(); }, controller.signal))
      .toMatchObject({ status: "cancelled", consecutiveFailures: 0, feedStallAlertStatus: "not-needed" });
    expect(await backing.read()).toMatchObject({ lastFeedEventId: 100 });
    now += 60_000;
    expect(await monitor.run(async context => { context.feed(); }))
      .toMatchObject({ feedIdleMs: 60_000, feedStallAlertStatus: "not-needed" });
    expect(await backing.read()).toMatchObject({ lastFeedEventId: 200, lastNewEventAt: START + 119 * 60_000 });
  });

  it("retries failed delivery and names the recent-events feed in Discord", async () => {
    let now = START;
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(Response.json({ id: "confirmed" }));
    const monitor = createIngestionMonitor({ region: "europe", now: () => now, log() {},
      sendAlert: discordNotifier("https://discord.com/api/webhooks/123/test-token", request) });
    await monitor.run(async context => { context.feed(100); });
    now += 2 * HOUR;
    expect((await monitor.run(async context => { context.feed(100); })).feedStallAlertStatus).toBe("failed");
    expect((await monitor.run(async context => { context.feed(100); })).feedStallAlertStatus).toBe("sent");
    expect((await monitor.run(async context => { context.feed(100); })).feedStallAlertStatus).toBe("already-sent");
    expect(request).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(request.mock.calls[1][1]?.body));
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0]).toMatchObject({ title: "Ingestion feed stalled", color: 0xf59e0b });
    expect(body.embeds[0].description).toContain("**120 minutes**");
    expect(body.embeds[0].fields).toEqual([
      { name: "Region", value: "europe", inline: true },
      { name: "Stage", value: "Recent-events feed", inline: true },
    ]);
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
});
