import { createAlbionClient } from "@albion/albion-client";
import type { AlbionFetch } from "@albion/albion-client";
import { describe, expect, it, vi } from "vitest";
import { createWorker } from "./worker.ts";

function event(id: number) {
  return {
    EventId: id,
    TimeStamp: "2026-09-25T12:00:00Z",
    Killer: { Id: "killer", Name: "Killer" },
    Victim: { Id: "victim", Name: "Victim" },
    Participants: [],
  };
}

function response(status: number, payload: unknown) {
  return {
    ok: status === 200,
    status,
    statusText: status === 200 ? "OK" : "Bad Gateway",
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

type WorkerOptions = Omit<Parameters<typeof createWorker>[0], "client">;

function testWorker({ fetch, ...options }: { fetch: AlbionFetch } & Partial<WorkerOptions>) {
  return createWorker({
    client: createAlbionClient({ region: "europe", fetch, retry: { delaysMs: [] } }).gameinfo,
    findExistingIds: async () => new Set(),
    onEvents: async () => {},
    intervalMs: 1,
    logger: logger(),
    ...options,
  });
}

describe("worker", () => {
  it("does not process the same batch twice", async () => {
    const saved = new Set<string>();
    const onEvents = vi.fn(async (events: { id: number }[]) => {
      for (const entry of events) saved.add(String(entry.id));
    });
    const worker = testWorker({
      fetch: async () => response(200, [event(42)]),
      findExistingIds: async (ids) => new Set(ids.filter((id) => saved.has(id))),
      onEvents,
      maxPages: 1,
    });

    await worker.runCycle();
    const firstState = [...saved];
    await worker.runCycle();

    expect([...saved]).toEqual(firstState);
    expect(onEvents).toHaveBeenCalledTimes(1);
  });

  it("remembers events across empty and partially overlapping responses", async () => {
    const batches = [[event(42), event(43)], [], [event(43)], [event(42)]];
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async () => response(200, batches.shift() ?? []),
      onEvents,
      maxPages: 1,
    });

    for (let cycle = 0; cycle < 4; cycle += 1) await worker.runCycle();

    expect(onEvents).toHaveBeenCalledOnce();
  });

  it("continues on the next scheduled cycle after a simulated 502", async () => {
    let requests = 0;
    const fetch: AlbionFetch = async () =>
      ++requests === 1
        ? response(502, null)
        : response(200, [event(43)]);
    const controller = new AbortController();
    const onEvents = vi.fn(async () => controller.abort());
    const log = logger();
    const worker = testWorker({
      fetch: fetch,
      onEvents,
      maxPages: 1,
      logger: log,
    });

    await worker.run(controller.signal);

    expect(requests).toBe(2);
    expect(log.error).toHaveBeenCalledOnce();
    expect(onEvents).toHaveBeenCalledOnce();
  });

  it("continues past known events to reach older unprocessed events", async () => {
    const offsets: number[] = [];
    const fetch: AlbionFetch = async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      offsets.push(offset);
      const payload = offset === 0
        ? Array.from({ length: 51 }, (_, index) => event(200 - index))
        : offset === 51
          ? Array.from({ length: 51 }, (_, index) => event(149 - index))
          : [event(98)];
      return response(200, payload);
    };
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: fetch,
      findExistingIds: async (ids) =>
        new Set(ids.filter((id) => id === "149")),
      onEvents,
      maxPages: 4,
    });

    const result = await worker.runCycle();

    expect(offsets).toEqual([0, 51, 102]);
    expect(result.newEvents).toBe(102);
    expect(onEvents).toHaveBeenCalledOnce();
  });

  it("keeps valid events when one record is malformed", async () => {
    const log = logger();
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async () => response(200, [event(44), { EventId: 45 }]),
      onEvents,
      maxPages: 1,
      logger: log,
    });

    await expect(worker.runCycle()).resolves.toEqual({ newEvents: 1, failures: 1 });
    expect(onEvents.mock.calls[0]?.[0]).toMatchObject([{ id: 44 }]);
    expect(log.warn).toHaveBeenCalledWith(
      "Malformed Albion event",
      expect.objectContaining({ eventId: 45, reason: expect.any(String) }),
    );
  });

  it("retries an event if its handler fails", async () => {
    const onEvents = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    let requests = 0;
    const worker = testWorker({
      fetch: async () => response(200, ++requests === 1 ? [event(46)] : []),
      onEvents,
      maxPages: 1,
    });

    await expect(worker.runCycle()).rejects.toThrow("database unavailable");
    await expect(worker.runCycle()).resolves.toEqual({ newEvents: 1, failures: 0 });
    expect(onEvents).toHaveBeenCalledTimes(2);
  });

  it("recovers a malformed event by ID after it disappears from the feed", async () => {
    let cycles = 0;
    const urls: string[] = [];
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async (url) => {
        urls.push(url);
        return response(200, new URL(url).pathname.endsWith("/events/45")
          ? event(45)
          : ++cycles === 1 ? [event(44), { EventId: 45 }] : [event(44)]);
      },
      onEvents,
    });

    await worker.runCycle();
    await worker.runCycle();
    await worker.runCycle();

    expect(urls.filter((url) => url.endsWith("/events/45"))).toHaveLength(1);
    expect(onEvents.mock.calls.map(([events]) => events.map(({ id }) => id)))
      .toEqual([[44], [45]]);
  });

  it("scans beyond four pages by default", async () => {
    const offsets: number[] = [];
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        return response(200, offset < 255
          ? Array.from({ length: 51 }, (_, index) => event(offset + index + 1))
          : []);
      },
    });

    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 255 });
    expect(offsets).toEqual([0, 51, 102, 153, 204, 255]);
  });

  it("stops at the previous completed boundary while recovering an older failure", async () => {
    let cycle = 0;
    const offsets: number[] = [];
    let recoveryAttempts = 0;
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async (url) => {
        if (url.endsWith("/events/149")) {
          recoveryAttempts++;
          return response(200, event(149));
        }
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        if (offset === 0) cycle++;
        return response(200, offset === 0
          ? Array.from({ length: 51 }, (_, index) => event((cycle === 1 ? 200 : 201) - index))
          : [{ EventId: 149 }]);
      },
      onEvents,
    });

    await worker.runCycle();
    await worker.runCycle();
    await worker.runCycle();

    expect(offsets).toEqual([0, 51, 0, 0]);
    expect(recoveryAttempts).toBe(1);
    expect(onEvents.mock.calls[1]?.[0].map(({ id }) => id)).toEqual([201]);
    expect(onEvents.mock.calls[2]?.[0].map(({ id }) => id)).toEqual([149]);
    expect(onEvents).toHaveBeenCalledTimes(3);
  });

  it("repeats capped scans without repeating handled events", async () => {
    let requests = 0;
    const log = logger();
    const worker = testWorker({
      fetch: async () => {
        requests++;
        return response(200, Array.from({ length: 51 }, (_, index) => event(100 - index)));
      },
      maxPages: 1,
      logger: log,
    });

    await worker.runCycle();
    await worker.runCycle();

    expect(requests).toBe(2);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it("drains a failed handler batch before scanning again", async () => {
    let cycle = 0;
    const offsets: number[] = [];
    const onEvents = vi.fn()
      .mockRejectedValueOnce(new Error("handler unavailable"))
      .mockResolvedValue(undefined);
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        if (offset === 0) cycle++;
        return response(200, offset === 0
          ? Array.from({ length: 51 }, (_, index) => event(200 - index))
          : cycle === 1 ? [] : [event(149)]);
      },
      onEvents,
    });

    await expect(worker.runCycle()).rejects.toThrow("handler unavailable");
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 52 });
    expect(offsets).toEqual([0, 51, 0, 51]);
  });

  it("does not let an unresolved event block newer valid events", async () => {
    let cycle = 0;
    let recoveryAttempts = 0;
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async (url) => {
        if (url.endsWith("/events/45")) {
          recoveryAttempts++;
          return response(502, null);
        }
        return response(200, ++cycle === 1 ? [{ EventId: 45 }] : [event(46 + cycle)]);
      },
      onEvents,
    });

    for (let cycle = 0; cycle < 3; cycle++) await worker.runCycle();

    expect(recoveryAttempts).toBe(2);
    expect(onEvents.mock.calls.map(([events]) => events.map(({ id }) => id)))
      .toEqual([[48], [49]]);
  });

  it("processes fetched events even when a later page fails", async () => {
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const log = logger();
    const worker = testWorker({
      fetch: async (url) => new URL(url).searchParams.get("offset") === "0"
        ? response(200, Array.from({ length: 51 }, (_, index) => event(index + 1)))
        : response(502, null),
      onEvents,
      logger: log,
    });

    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 51 });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 0 });
    expect(onEvents).toHaveBeenCalledOnce();
    expect(log.error).toHaveBeenCalledTimes(2);
  });

  it("stops if the API repeats a full page instead of advancing", async () => {
    let requests = 0;
    const log = logger();
    const worker = testWorker({
      fetch: async () => {
        requests++;
        return response(200, Array.from({ length: 51 }, (_, index) => event(index + 1)));
      },
      logger: log,
    });

    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 51 });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 0 });
    expect(requests).toBe(4);
    expect(log.warn).toHaveBeenCalledWith(
      "Pagination made no progress; older events may be unavailable.",
    );
  });

  it("deduplicates a logging-only handler across intervening batches", async () => {
    const batches = [[event(42)], [event(43)], [event(42)], [event(42)]];
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async () => response(200, batches.shift() ?? []),
      onEvents,
    });
    for (let cycle = 0; cycle < 4; cycle++) await worker.runCycle();
    expect(onEvents).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous boundary when a later page fails", async () => {
    let cycle = 0;
    const offsets: number[] = [];
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        if (offset === 0) {
          cycle++;
          return response(200, Array.from({ length: 51 }, (_, i) => event((cycle === 1 ? 200 : 261) - i)));
        }
        if (cycle === 2) return response(502, null);
        return response(200, cycle === 1 ? []
          : Array.from({ length: 51 }, (_, i) => event(210 - i)));
      },
      onEvents,
    });
    await worker.runCycle();
    await worker.runCycle();
    await worker.runCycle();
    expect(offsets).toEqual([0, 51, 0, 51, 0, 51]);
    expect(onEvents.mock.calls[2]?.[0].map(({ id }) => id))
      .toEqual(Array.from({ length: 10 }, (_, i) => 210 - i));
  });

  it("fetches multiple new pages then stops at the previous completed boundary", async () => {
    let feed = Array.from({ length: 103 }, (_, i) => event(200 - i));
    const offsets: number[] = [];
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        return response(200, feed.slice(offset, offset + 51));
      },
      onEvents,
    });
    await worker.runCycle();
    feed = [...Array.from({ length: 60 }, (_, i) => event(260 - i)), ...feed];
    await worker.runCycle();
    expect(offsets).toEqual([0, 51, 102, 0, 51]);
    expect(onEvents.mock.calls[1]?.[0].map(({ id }) => id))
      .toEqual(Array.from({ length: 60 }, (_, i) => 260 - i));
  });

  it("does not fetch more events while the existing-ID lookup remains unavailable", async () => {
    let requests = 0;
    const findExistingIds = vi.fn()
      .mockRejectedValueOnce(new Error("DB unavailable"))
      .mockRejectedValueOnce(new Error("DB unavailable"))
      .mockResolvedValue(new Set());
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async () => response(200, [event(42 + requests++)]),
      findExistingIds, onEvents,
    });
    await expect(worker.runCycle()).rejects.toThrow("DB unavailable");
    await expect(worker.runCycle()).rejects.toThrow("DB unavailable");
    expect(requests).toBe(1);
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 2 });
    expect(findExistingIds.mock.calls.map(([ids]) => ids)).toEqual([["42"], ["42"], ["42"], ["43"]]);
    expect(onEvents.mock.calls.map(([events]) => events.map(({ id }) => id))).toEqual([[42], [43]]);
  });

  it("limits recovery attempts per cycle, rotates failures, and handles fresh events first", async () => {
    let cycle = 0;
    const order: string[] = [];
    const worker = testWorker({
      fetch: async (url) => {
        const id = new URL(url).pathname.match(/events\/(\d+)$/)?.[1];
        if (id) { order.push(`retry:${id}`); return response(502, null); }
        return response(200, ++cycle === 1
          ? Array.from({ length: 12 }, (_, i) => ({ EventId: i + 1 }))
          : [event(100 + cycle)]);
      },
      onEvents: async () => { order.push("handled"); },
    });
    for (let cycle = 0; cycle < 3; cycle++) await worker.runCycle();
    expect(order).toEqual([
      "handled", "retry:1", "retry:2", "retry:3", "retry:4", "retry:5",
      "handled", "retry:6", "retry:7", "retry:8", "retry:9", "retry:10",
    ]);
  });

  it("stops retrying an exhausted ID even if the malformed record keeps reappearing", async () => {
    let attempts = 0;
    let valid = false;
    const onEvents = vi.fn(async () => {});
    const log = logger();
    const worker = testWorker({
      fetch: async (url) => {
        if (url.endsWith("/events/45")) { attempts++; return response(404, null); }
        return response(200, [valid ? event(45) : { EventId: 45 }]);
      },
      onEvents, logger: log,
    });
    for (let cycle = 0; cycle < 8; cycle++) await worker.runCycle();
    expect(attempts).toBe(5);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("exhausted"), expect.objectContaining({ id: 45 }));
    valid = true;
    await worker.runCycle();
    expect(onEvents).toHaveBeenCalledOnce();
    expect(attempts).toBe(5);
  });

  it("does not queue unusable IDs or retry a malformed copy of a valid pending event", async () => {
    const urls: string[] = [];
    const log = logger();
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async (url) => {
        urls.push(url);
        return response(200, [
          ...[-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined].map((EventId) => ({ EventId })),
          event(-2), event(42), { EventId: 42 },
        ]);
      },
      onEvents, logger: log,
    });
    await worker.runCycle();
    await worker.runCycle();
    expect(urls.every((url) => new URL(url).pathname.endsWith("/events"))).toBe(true);
    expect(onEvents).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("usable event ID"), expect.anything());
  });

  it("continues past a full page of malformed records without IDs", async () => {
    const offsets: number[] = [];
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        return response(200, offset === 0 ? Array.from({ length: 51 }, () => ({})) : [event(42)]);
      },
      onEvents,
    });
    await expect(worker.runCycle()).resolves.toEqual({ newEvents: 1, failures: 51 });
    expect(offsets).toEqual([0, 51]);
  });

  it("finishes at Albion's maximum offset and saves the boundary for the next cycle", async () => {
    const offsets: number[] = [];
    const log = logger();
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        return offset > 1000 ? response(400, null)
          : response(200, Array.from({ length: 51 }, (_, i) => event(2000 - offset - i)));
      },
      onEvents, logger: log,
    });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 1051 });
    expect(offsets).toEqual([...Array.from({ length: 20 }, (_, i) => i * 51), 1000]);
    expect(onEvents.mock.calls[0]?.[0].map(({ id }) => id))
      .toEqual(Array.from({ length: 1051 }, (_, i) => 2000 - i));
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 0 });
    expect(offsets.at(-1)).toBe(0);
    expect(offsets).toHaveLength(22);
    expect(onEvents).toHaveBeenCalledOnce();
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("respects Albion's offset limit even with a large page cap", async () => {
    const offsets: number[] = [];
    const log = logger();
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        return response(200, Array.from({ length: 51 }, (_, i) => event(offset + i + 1)));
      },
      onEvents, maxPages: 500, logger: log,
    });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 1051 });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 0 });
    expect(offsets).toHaveLength(22);
    expect(Math.max(...offsets)).toBe(1000);
    expect(onEvents).toHaveBeenCalledOnce();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("keeps the boundary unchanged when the final allowed page fails", async () => {
    let cycle = 0;
    const offsets: number[] = [];
    const log = logger();
    const worker = testWorker({
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        if (offset === 0) cycle++;
        if (offset === 1000 && cycle === 1) return response(400, null);
        return response(200, Array.from({ length: 51 }, (_, i) => event(2000 - offset - i)));
      },
      logger: log,
    });

    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 1020 });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 31 });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 0 });
    expect(offsets).toHaveLength(43);
    expect(offsets.filter((offset) => offset === 1000)).toHaveLength(2);
    expect(offsets.at(-1)).toBe(0);
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("bounds the recovery queue and reports IDs that cannot be retained", async () => {
    const attempts: number[] = [];
    const log = logger();
    const worker = testWorker({
      fetch: async (url) => {
        const parsed = new URL(url);
        const id = parsed.pathname.match(/events\/(\d+)$/)?.[1];
        if (id) { attempts.push(Number(id)); return response(404, null); }
        const offset = Number(parsed.searchParams.get("offset"));
        return response(200, offset < 1020
          ? Array.from({ length: 51 }, (_, i) => ({ EventId: offset + i + 1 })) : []);
      },
      logger: log,
    });
    await worker.runCycle();
    expect(log.warn.mock.calls.filter(([message]) => message === "Recovery queue full; event cannot be retained.")).toHaveLength(71);
    await worker.runCycle();
    expect(attempts).toEqual([1, 2, 3, 4, 5]);
  });

  it("processes partial scan results after a timeout and progresses on the next cycle", async () => {
    let requests = 0;
    let hangingSignal: AbortSignal | undefined;
    const onEvents = vi.fn(async () => {});
    const log = logger();
    const worker = testWorker({
      fetch: async (_url, init) => {
        if (++requests === 2) { hangingSignal = init?.signal; return new Promise(() => {}); }
        return response(200, requests === 1 ? Array.from({ length: 51 }, (_, i) => event(i + 1)) : []);
      },
      onEvents, cycleTimeoutMs: 100, logger: log,
    });
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 51 });
    expect(hangingSignal?.aborted).toBe(true);
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 0 });
    expect(onEvents).toHaveBeenCalledOnce();
    expect(requests).toBe(3);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("time budget exhausted"));
  });

  it("continues queued recovery across consecutive first-page failures", async () => {
    let feedRequests = 0;
    let recoveryAttempts = 0;
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const log = logger();
    const worker = testWorker({
      fetch: async (url) => {
        if (url.endsWith("/events/45")) {
          return ++recoveryAttempts === 1 ? response(502, null) : response(200, event(45));
        }
        return ++feedRequests === 1 ? response(200, [{ EventId: 45 }]) : response(502, null);
      },
      onEvents, logger: log,
    });

    await worker.runCycle();
    await expect(worker.runCycle()).resolves.toEqual({ newEvents: 0, failures: 0 });
    await expect(worker.runCycle()).resolves.toEqual({ newEvents: 1, failures: 0 });

    expect(feedRequests).toBe(3);
    expect(recoveryAttempts).toBe(2);
    expect(onEvents).toHaveBeenCalledOnce();
    expect(onEvents.mock.calls[0]?.[0]).toMatchObject([{ id: 45 }]);
    expect(log.error).toHaveBeenCalledTimes(2);
  });

  it("reserves recovery time when the feed hangs", async () => {
    let feedRequests = 0;
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const worker = testWorker({
      fetch: async (url) => {
        if (url.endsWith("/events/45")) return response(200, event(45));
        if (++feedRequests === 1) return response(200, [{ EventId: 45 }]);
        return new Promise(() => {});
      },
      onEvents, cycleTimeoutMs: 100,
    });
    await worker.runCycle();
    await expect(worker.runCycle()).resolves.toMatchObject({ newEvents: 1 });
    expect(onEvents.mock.calls[0]?.[0]).toMatchObject([{ id: 45 }]);
  });

  it("rotates a recovery that consumes the API deadline", async () => {
    let feedRequests = 0;
    const attempts: number[] = [];
    const worker = testWorker({
      fetch: async (url) => {
        const id = new URL(url).pathname.match(/events\/(\d+)$/)?.[1];
        if (id) {
          attempts.push(Number(id));
          return attempts.length === 1 ? new Promise(() => {}) : response(200, event(Number(id)));
        }
        return response(200, ++feedRequests === 1 ? [{ EventId: 45 }, { EventId: 46 }] : []);
      },
      cycleTimeoutMs: 100,
    });
    await worker.runCycle();
    await worker.runCycle();
    await worker.runCycle();
    expect(attempts).toEqual([45, 46, 45]);
  });

  it("cancels an in-flight feed request on shutdown", async () => {
    const controller = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let requestSignal: AbortSignal | undefined;
    const log = logger();
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async (_url, init) => {
        requestSignal = init?.signal;
        entered();
        return new Promise(() => {});
      },
      onEvents, logger: log,
    });
    const running = worker.run(controller.signal);
    await started;
    controller.abort();
    await running;
    expect(requestSignal?.aborted).toBe(true);
    expect(onEvents).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("cancels the interval sleep on shutdown", async () => {
    let finished!: () => void;
    const completed = new Promise<void>((resolve) => { finished = resolve; });
    const fetch = vi.fn(async () => response(200, []));
    const controller = new AbortController();
    const worker = testWorker({
      fetch: fetch, intervalMs: 60_000, logger: { ...logger(), info: finished },
    });
    const running = worker.run(controller.signal);
    await completed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    await running;
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects oversized pages without accumulating their events", async () => {
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async () => response(200, Array.from({ length: 52 }, (_, i) => event(i + 1))),
      onEvents,
    });
    await expect(worker.runCycle()).rejects.toThrow("more events than the requested page size");
    expect(onEvents).not.toHaveBeenCalled();
  });

  it("continues queued recovery when the feed returns oversized pages", async () => {
    let feedRequests = 0;
    const recovery = vi.fn(async () => response(200, event(45)));
    const onEvents = vi.fn(async (_events: { id: number }[]) => {});
    const log = logger();
    const worker = testWorker({
      fetch: async (url) => {
        if (url.endsWith("/events/45")) return recovery();
        return response(200, ++feedRequests === 1
          ? [{ EventId: 45 }]
          : Array.from({ length: 52 }, (_, i) => event(100 + i)));
      },
      onEvents, logger: log,
    });

    await worker.runCycle();
    await expect(worker.runCycle()).resolves.toEqual({ newEvents: 1, failures: 0 });

    expect(recovery).toHaveBeenCalledOnce();
    expect(onEvents).toHaveBeenCalledOnce();
    expect(onEvents.mock.calls[0]?.[0]).toMatchObject([{ id: 45 }]);
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("uses a malformed first record as the newest boundary", async () => {
    let feedRequests = 0;
    const offsets: number[] = [];
    const log = logger();
    const worker = testWorker({
      fetch: async (url) => {
        if (url.endsWith("/events/200")) return response(502, null);
        offsets.push(Number(new URL(url).searchParams.get("offset")));
        return response(200, ++feedRequests === 1
          ? [{ EventId: 200 }, ...Array.from({ length: 49 }, (_, i) => event(199 - i))]
          : [...Array.from({ length: 50 }, (_, i) => event(250 - i)), { EventId: 200 }]);
      },
      maxPages: 1, logger: log,
    });

    await worker.runCycle();
    await worker.runCycle();

    expect(offsets).toEqual([0, 0]);
    expect(log.warn.mock.calls.some(([message]) => message.includes("WORKER_MAX_PAGES"))).toBe(false);
  });

  it("does not start the handler after shutdown during an existing-ID lookup", async () => {
    let entered!: () => void;
    let release!: (ids: Set<string>) => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const lookup = new Promise<Set<string>>((resolve) => { release = resolve; });
    const controller = new AbortController();
    const onEvents = vi.fn(async () => {});
    const worker = testWorker({
      fetch: async () => response(200, [event(42)]),
      findExistingIds: async () => { entered(); return lookup; },
      onEvents,
    });
    const running = worker.run(controller.signal);
    await started;
    controller.abort();
    release(new Set());
    await running;
    expect(onEvents).not.toHaveBeenCalled();
  });
});
