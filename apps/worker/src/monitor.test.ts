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

  it("counts repeated read outages without overwriting unknown stored state", async () => {
    let unavailable = true;
    let saved = { consecutiveFailures: 2, alerted: false };
    const store = {
      read: async () => { if (unavailable) throw new Error("Read unavailable"); return { ...saved }; },
      write: vi.fn(async (next: typeof saved) => { saved = { ...next }; }),
    };
    const sendAlert = vi.fn(async () => {});
    const work = vi.fn(fail);
    const monitor = createIngestionMonitor({ region: "europe", store, sendAlert, log: vi.fn() });
    for (let count = 1; count <= 4; count++) {
      expect(await monitor.run(work)).toMatchObject({ status: "failure", failedStage: "monitor_state", consecutiveFailures: count });
    }
    expect(work).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
    expect(sendAlert).toHaveBeenCalledOnce();
    unavailable = false;
    expect(await monitor.run(fail)).toMatchObject({ consecutiveFailures: 7, alertStatus: "already-sent" });
    expect(saved).toEqual({ consecutiveFailures: 7, alerted: true });
  });

  it("counts reset-write outages and persists the incident when writes recover", async () => {
    let unavailable = true;
    const backing = memoryStateStore();
    const store = { read: backing.read, write: async (state: Parameters<typeof backing.write>[0]) => {
      if (unavailable) throw new Error("Write unavailable");
      await backing.write(state);
    } };
    const sendAlert = vi.fn(async () => {});
    const monitor = createIngestionMonitor({ region: "europe", store, sendAlert, log: vi.fn() });
    for (let count = 1; count <= 4; count++) {
      expect(await monitor.run(async () => {})).toMatchObject({ status: "failure", failedStage: "monitor_state", consecutiveFailures: count });
    }
    expect(sendAlert).toHaveBeenCalledOnce();
    unavailable = false;
    expect(await monitor.run(fail)).toMatchObject({ consecutiveFailures: 5, alertStatus: "already-sent" });
    expect(await backing.read()).toEqual({ consecutiveFailures: 5, alerted: true });
    await monitor.run(async () => {});
    expect(await backing.read()).toEqual({ consecutiveFailures: 0, alerted: false });
  });

  it("keeps confirmed delivery when acknowledgment fails and retries persistence without resending", async () => {
    const backing = memoryStateStore();
    let rejectAcknowledgment = true;
    const store = { read: backing.read, write: async (state: Parameters<typeof backing.write>[0]) => {
      if (state.alerted && rejectAcknowledgment) throw new Error("Acknowledgment unavailable");
      await backing.write(state);
    } };
    const sendAlert = vi.fn(async () => {});
    const log = vi.fn();
    const monitor = createIngestionMonitor({ region: "europe", store, sendAlert, failureThreshold: 1, log });
    expect((await monitor.run(fail)).alertStatus).toBe("sent");
    expect((await monitor.run(fail)).alertStatus).toBe("already-sent");
    expect(sendAlert).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith({ event: "ingestion.monitor_error", error: "Acknowledgment unavailable" });
    rejectAcknowledgment = false;
    await monitor.run(fail);
    expect(await backing.read()).toEqual({ consecutiveFailures: 3, alerted: true });
    const restarted = createIngestionMonitor({ region: "europe", store, sendAlert, failureThreshold: 1, log });
    expect((await restarted.run(fail)).alertStatus).toBe("already-sent");
    expect(sendAlert).toHaveBeenCalledOnce();
  });

  it("finishes a reset write when shutdown arrives after successful work", async () => {
    const controller = new AbortController();
    const backing = memoryStateStore();
    await backing.write({ consecutiveFailures: 2, alerted: false });
    const monitor = createIngestionMonitor({ region: "europe", log: vi.fn(), store: {
      read: backing.read,
      write: async (state) => { controller.abort(); await backing.write(state); },
    } });
    expect(await monitor.run(async () => {}, controller.signal)).toMatchObject({ status: "success", consecutiveFailures: 0 });
    expect(await backing.read()).toEqual({ consecutiveFailures: 0, alerted: false });
  });

  it("retains known incident history during later read outages and resets after recovery", async () => {
    const backing = memoryStateStore();
    let unavailable = false;
    const store = {
      read: async () => { if (unavailable) throw new Error("Read unavailable"); return backing.read(); },
      write: backing.write,
    };
    const sendAlert = vi.fn(async () => {});
    const monitor = createIngestionMonitor({ region: "europe", store, sendAlert, log: vi.fn() });
    expect((await monitor.run(fail)).consecutiveFailures).toBe(1);
    unavailable = true;
    expect((await monitor.run(fail)).consecutiveFailures).toBe(2);
    expect(await monitor.run(fail)).toMatchObject({ consecutiveFailures: 3, alertStatus: "sent" });
    expect(sendAlert).toHaveBeenCalledOnce();
    unavailable = false;
    expect(await monitor.run(async () => {})).toMatchObject({ status: "success", consecutiveFailures: 0 });
    expect(await backing.read()).toEqual({ consecutiveFailures: 0, alerted: false });
  });

  it("redacts connection strings and webhook tokens", () => {
    const message = safeError(new Error("Cannot reach postgresql://user:password@db/private or https://discord.com/api/webhooks/123/secret"));
    expect(message).toBe("Cannot reach [redacted URL] or [redacted URL]");
    expect(message).not.toContain("password");
    expect(message).not.toContain("secret");
  });
});

describe("boundary warning monitoring", () => {
  const miss = async (context: RunContext) => { context.boundaryMiss(); };

  it("logs the per-run count and alerts once after consecutive affected runs across restarts", async () => {
    const store = memoryStateStore();
    const sendAlert = vi.fn(async (_report: RunReport) => {});
    for (let run = 1; run <= 4; run++) {
      const log = vi.fn();
      const monitor = createIngestionMonitor({ region: "europe", store, sendAlert, log });
      const report = await monitor.run(async (context) => { context.boundaryMiss(); context.boundaryMiss(); });
      expect(report).toMatchObject({ status: "success", boundaryMisses: 2, consecutiveBoundaryMisses: run,
        consecutiveFailures: 0, alertStatus: "not-needed",
        boundaryAlertStatus: run < 3 ? "not-needed" : run === 3 ? "sent" : "already-sent" });
      expect(log).toHaveBeenCalledWith(report);
    }
    expect(sendAlert).toHaveBeenCalledOnce();
    expect(sendAlert.mock.calls[0][0]).toMatchObject({ alertType: "polling_interval", consecutiveBoundaryMisses: 3 });
  });

  it("resets the streak and alert flag after a clean successful run", async () => {
    const sendAlert = vi.fn(async () => {});
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 2, sendAlert, log: vi.fn() });
    await monitor.run(miss);
    expect((await monitor.run(miss)).boundaryAlertStatus).toBe("sent");
    expect(await monitor.run(async () => {})).toMatchObject({ boundaryMisses: 0, consecutiveBoundaryMisses: 0 });
    expect(await monitor.run(miss)).toMatchObject({ consecutiveBoundaryMisses: 1, boundaryAlertStatus: "not-needed" });
    expect((await monitor.run(miss)).boundaryAlertStatus).toBe("sent");
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });

  it("breaks the warning streak on a run with no boundary warning even if execution fails", async () => {
    const monitor = createIngestionMonitor({ region: "europe", log: vi.fn() });
    await monitor.run(miss);
    expect(await monitor.run(fail)).toMatchObject({ boundaryMisses: 0, consecutiveBoundaryMisses: 0,
      boundaryAlertStatus: "not-needed", consecutiveFailures: 1 });
    expect((await monitor.run(miss)).consecutiveBoundaryMisses).toBe(1);
  });

  it("does not restore a stale warning streak after an initial state-read failure", async () => {
    const backing = memoryStateStore();
    await backing.write({ consecutiveFailures: 0, alerted: false, consecutiveBoundaryMisses: 2, boundaryAlerted: false });
    const read = vi.fn(backing.read).mockRejectedValueOnce(new Error("Read unavailable"));
    const sendAlert = vi.fn(async () => {});
    const monitor = createIngestionMonitor({ region: "europe", store: { read, write: backing.write }, sendAlert, log: vi.fn() });
    await monitor.run(miss);
    expect(await monitor.run(miss)).toMatchObject({ consecutiveBoundaryMisses: 1, boundaryAlertStatus: "not-needed" });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("keeps polling and execution failure alerts independent", async () => {
    const sendAlert = vi.fn(async (_report: RunReport) => {});
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert, log: vi.fn() });
    expect(await monitor.run(async (context) => { context.boundaryMiss(); await fail(context); }))
      .toMatchObject({ alertStatus: "sent", boundaryAlertStatus: "sent" });
    expect(sendAlert.mock.calls.map(([report]) => report.alertType)).toEqual(["failure", "polling_interval"]);
    expect(await monitor.run(miss)).toMatchObject({ consecutiveFailures: 0, boundaryAlertStatus: "already-sent" });
    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect((await monitor.run(fail)).alertStatus).toBe("sent");
    expect(sendAlert).toHaveBeenCalledTimes(3);
  });

  it("retries failed boundary alert delivery on the next affected run", async () => {
    const sendAlert = vi.fn().mockRejectedValueOnce(new Error("Discord unavailable")).mockResolvedValue(undefined);
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert, log: vi.fn() });
    expect((await monitor.run(miss)).boundaryAlertStatus).toBe("failed");
    expect((await monitor.run(miss)).boundaryAlertStatus).toBe("sent");
    expect((await monitor.run(miss)).boundaryAlertStatus).toBe("already-sent");
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });

  it("still delivers the polling alert if the execution-failure alert cannot be sent", async () => {
    const sendAlert = vi.fn<NonNullable<Parameters<typeof createIngestionMonitor>[0]["sendAlert"]>>()
      .mockRejectedValueOnce(new Error("First delivery unavailable")).mockResolvedValue(undefined);
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert, log: vi.fn() });
    const report = await monitor.run(async (context) => { context.boundaryMiss(); await fail(context); });
    expect(report).toMatchObject({ alertStatus: "failed", boundaryAlertStatus: "sent" });
    expect(sendAlert.mock.calls.map(([entry]) => entry.alertType)).toEqual(["failure", "polling_interval"]);
  });

  it("keeps boundary delivery and streak during acknowledgment write outages", async () => {
    const backing = memoryStateStore();
    let unavailable = true;
    const store = { read: backing.read, write: async (state: Parameters<typeof backing.write>[0]) => {
      if (unavailable && state.boundaryAlerted) throw new Error("Acknowledgment unavailable");
      await backing.write(state);
    } };
    const sendAlert = vi.fn(async (_report: RunReport) => {});
    const monitor = createIngestionMonitor({ region: "europe", store, sendAlert, failureThreshold: 1, log: vi.fn() });
    expect((await monitor.run(miss)).boundaryAlertStatus).toBe("sent");
    expect((await monitor.run(miss)).boundaryAlertStatus).toBe("already-sent");
    expect(sendAlert.mock.calls.filter(([report]) => report.alertType === "polling_interval")).toHaveLength(1);
    expect(sendAlert.mock.calls.filter(([report]) => report.alertType === "failure")).toHaveLength(1);
    unavailable = false;
    await monitor.run(miss);
    expect(await backing.read()).toMatchObject({ consecutiveBoundaryMisses: 3, boundaryAlerted: true });
    const restarted = createIngestionMonitor({ region: "europe", store, sendAlert, failureThreshold: 1, log: vi.fn() });
    expect((await restarted.run(miss)).boundaryAlertStatus).toBe("already-sent");
    expect(sendAlert.mock.calls.filter(([report]) => report.alertType === "polling_interval")).toHaveLength(1);
  });

  it("does not advance or reset the warning streak on cancellation", async () => {
    const monitor = createIngestionMonitor({ region: "europe", log: vi.fn() });
    await monitor.run(miss);
    const controller = new AbortController();
    const report = await monitor.run(async (context) => { context.boundaryMiss(); controller.abort(); }, controller.signal);
    expect(report).toMatchObject({ status: "cancelled", boundaryMisses: 1, consecutiveBoundaryMisses: 1,
      boundaryAlertStatus: "not-needed" });
  });
});

describe("Discord notifier", () => {
  it("explains repeated missing boundaries without claiming execution failed", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "message-123" }));
    const notify = discordNotifier("https://discord.com/api/webhooks/123/test-token", request);
    const monitor = createIngestionMonitor({ region: "europe", failureThreshold: 1, sendAlert: notify, log: vi.fn() });
    await monitor.run(async (context) => { context.boundaryMiss(); });
    const payload = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(payload.content).toContain("polling interval is too long");
    expect(payload.content).toContain("Poll more often");
    expect(payload.content).toContain("Stage: feed pagination");
    expect(payload.content).toContain("Missing-boundary warnings this run: 1");
    expect(payload.content).not.toContain("ingestion failed");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });
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
