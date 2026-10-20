import { describe, expect, it, vi } from "vitest";
import { createAlbionClient } from "@albion/albion-client";
import { discordNotifier } from "./discord";
import { createIngestionMonitor, memoryStateStore, safeError, type RunContext, type RunReport } from "./monitor";

const fail = async (context: RunContext) => {
  await context.stage("fetch", async () => { throw new Error("API unavailable"); });
};

describe("ingestion monitoring", () => {
  it("logs fetched, written, skipped reasons, retries and duration as structured data", async () => {
    const log = vi.fn();
    let clock = 0;
    const monitor = createIngestionMonitor({ region: "europe", log, now: () => clock });
    const report = await monitor.run(async (context) => {
      await context.stage("fetch", () => { context.fetched(5); context.retry(); });
      await context.stage("parse", () => context.skip("malformed_event"));
      await context.stage("write", () => { context.written(3); context.skip("duplicate_event"); clock = 120; });
    });
    expect(report).toMatchObject({ status: "success", fetched: 5, written: 3, skipped: 2, retries: 1, durationMs: 120, failedStage: null, skipReasons: { malformed_event: 1, duplicate_event: 1 } });
    expect(log).toHaveBeenCalledWith(report);
  });

  it("preserves consecutive failures across scheduled monitor instances", async () => {
    const store = memoryStateStore();
    const sendAlert = vi.fn(async (_report: RunReport) => {});
    for (let cycle = 1; cycle <= 3; cycle++) {
      const monitor = createIngestionMonitor({ region: "europe", store, sendAlert, log: vi.fn() });
      expect((await monitor.run(fail)).consecutiveFailures).toBe(cycle);
    }
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toMatchObject({ failedStage: "fetch", consecutiveFailures: 3 });
  });

  it("alerts within the failing cycle when a broken API reaches the threshold", async () => {
    const sendAlert = vi.fn(async () => {});
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert, log: vi.fn() });
    const report = await monitor.run(async (context) => {
      const client = createAlbionClient({
        region: "europe", baseUrl: "https://broken-api.invalid/",
        fetch: async () => { throw new TypeError("fetch failed"); },
        retry: { delaysMs: [0, 0] }, onRetry: () => context.retry(),
      });
      await context.stage("fetch", () => client.gameinfo.getRecentEventsTolerant());
    });
    expect(report).toMatchObject({ failedStage: "fetch", retries: 2, alertStatus: "sent" });
    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  it("names a failed write stage in the alert", async () => {
    const sendAlert = vi.fn(async (_report: RunReport) => {});
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert, log: vi.fn() });
    await monitor.run(async (context) => {
      context.fetched(2);
      await context.stage("write", async () => { throw new Error("Database unavailable"); });
    });
    expect(sendAlert.mock.calls[0][0]).toMatchObject({ failedStage: "write", fetched: 2, written: 0 });
  });

  it("sends one alert per incident and resets after a successful cycle", async () => {
    const sendAlert = vi.fn(async () => {});
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert, log: vi.fn() });
    expect((await monitor.run(fail)).alertStatus).toBe("sent");
    expect((await monitor.run(fail)).alertStatus).toBe("already-sent");
    expect((await monitor.run(async () => {})).consecutiveFailures).toBe(0);
    expect((await monitor.run(fail)).alertStatus).toBe("sent");
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });

  it("retries an unsuccessful Discord delivery on the next failed cycle", async () => {
    const sendAlert = vi.fn().mockRejectedValueOnce(new Error("HTTP 503")).mockResolvedValue(undefined);
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert, log: vi.fn() });
    expect((await monitor.run(fail)).alertStatus).toBe("failed");
    expect((await monitor.run(fail)).alertStatus).toBe("sent");
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });

  it("makes missing Discord configuration visible", async () => {
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, log: vi.fn() });
    expect((await monitor.run(fail)).alertStatus).toBe("unconfigured");
  });

  it("reports state persistence errors as failures", async () => {
    const monitor = createIngestionMonitor({
      region: "europe", log: vi.fn(),
      store: { read: async () => ({ consecutiveFailures: 0, alerted: false }), write: async () => { throw new Error("State storage unavailable"); } },
    });
    expect(await monitor.run(async () => {})).toMatchObject({ status: "failure", failedStage: "monitor_state" });
  });

  it("redacts connection strings and webhook tokens", () => {
    const message = safeError(new Error("Cannot reach postgresql://user:password@db/private or https://discord.com/api/webhooks/123/secret"));
    expect(message).toBe("Cannot reach [redacted URL] or [redacted URL]");
    expect(message).not.toContain("password");
    expect(message).not.toContain("secret");
  });
});

describe("Discord notifier", () => {
  it("sends the failed stage and metrics without triggering mentions", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "message-123" }));
    const notify = discordNotifier("https://discord.com/api/webhooks/123/test-token", request);
    const report = await createIngestionMonitor({ region: "europe", log: vi.fn() }).run(fail);
    await notify(report);
    const payload = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(payload.content).toContain("Failed stage: fetch");
    expect(payload.content).toContain("retries: 0");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(String(request.mock.calls[0][0])).toContain("wait=true");
  });
  it("rejects non-Discord URLs", () => {
    expect(() => discordNotifier("https://example.com/secret")).toThrow("Discord HTTPS webhook");
  });
  it("rejects unsuccessful webhook responses", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    const notify = discordNotifier("https://discord.com/api/webhooks/123/test-token", request);
    const report = await createIngestionMonitor({ region: "europe", log: vi.fn() }).run(fail);
    await expect(notify(report)).rejects.toThrow("HTTP 500");
  });
  it("rejects a response that does not confirm a message", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    const notify = discordNotifier("https://discord.com/api/webhooks/123/test-token", request);
    const report = await createIngestionMonitor({ region: "europe", log: vi.fn() }).run(fail);
    await expect(notify(report)).rejects.toThrow("did not confirm");
  });
});
