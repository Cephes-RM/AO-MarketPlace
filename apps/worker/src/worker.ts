import { setTimeout as sleep } from "node:timers/promises";
import type {
  AlbionClient,
  AlbionBatchResult,
  AlbionKillboardEvent,
} from "@albion/albion-client";

const PAGE_SIZE = 51;
const MAX_FEED_OFFSET = 1000;
const MAX_STATE_IDS = 10_000;
const MAX_FAILED_IDS = 1_000;
const RECOVERIES_PER_CYCLE = 5;
const MAX_RECOVERY_ATTEMPTS = 5;

type EventSource = Pick<AlbionClient["gameinfo"], "getRecentEventsTolerant" | "getEvent">;

interface WorkerOptions {
  client: EventSource;
  findExistingIds(ids: string[]): Promise<Set<string>>;
  onEvents(events: AlbionKillboardEvent[]): Promise<void>;
  maxPages?: number;
  cycleTimeoutMs?: number;
  intervalMs: number;
  logger: Pick<Console, "info" | "warn" | "error">;
}

function isUsableId(id: number | undefined): id is number {
  return id !== undefined && Number.isSafeInteger(id) && id > 0;
}

export function createWorker(options: WorkerOptions) {
  const recentIds = new Set<number>();
  // Assumes newest-first publication; delayed events below the boundary may be missed.
  let completedScanBoundary: number | undefined;
  // Exhausted entries suppress repeated malformed feed records until evicted or valid.
  const failedIds = new Map<number, number>();
  const pendingEvents = new Map<number, AlbionKillboardEvent>();

  function remember(id: number) {
    recentIds.delete(id);
    recentIds.add(id);
    if (recentIds.size > MAX_STATE_IDS) recentIds.delete(recentIds.values().next().value!);
  }

  async function handlePending(signal?: AbortSignal) {
    if (pendingEvents.size === 0 || signal?.aborted) return 0;
    const existingIds = await options.findExistingIds([...pendingEvents.keys()].map(String));
    if (signal?.aborted) return 0;
    const newEvents = [...pendingEvents.values()].filter((event) => !existingIds.has(String(event.id)));
    if (newEvents.length > 0) await options.onEvents(newEvents);
    for (const id of pendingEvents.keys()) {
      remember(id);
      failedIds.delete(id);
    }
    pendingEvents.clear();
    return newEvents.length;
  }

  async function runCycle(signal?: AbortSignal) {
    if (signal?.aborted) return { newEvents: 0, failures: 0 };
    let newEvents = await handlePending(signal);
    const timeoutMs = options.cycleTimeoutMs ?? 120_000;
    const deadline = AbortSignal.timeout(timeoutMs);
    const cycleSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    // Reserve half the API budget for recovery so a slow scan cannot starve it.
    const scanSignal = AbortSignal.any([cycleSignal, AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs / 2)))]);
    const recoveries = [...failedIds].filter(([, attempts]) => attempts < MAX_RECOVERY_ATTEMPTS)
      .slice(0, RECOVERIES_PER_CYCLE);
    const fetchedIds = new Set<number>();
    const maxPages = options.maxPages ?? 100;
    let failures = 0;
    let pageWasFull = false;
    let scanCompleted = false;
    let newestId: number | undefined;

    for (let page = 0; page < maxPages; page += 1) {
      if (scanSignal.aborted) break;
      if (fetchedIds.size + PAGE_SIZE > MAX_STATE_IDS) {
        options.logger.warn("Scan state limit reached; older events may be missed.");
        pageWasFull = false;
        break;
      }
      const offset = Math.min(page * PAGE_SIZE, MAX_FEED_OFFSET);
      let result: AlbionBatchResult<AlbionKillboardEvent>;
      try {
        result = await options.client.getRecentEventsTolerant({
          limit: PAGE_SIZE,
          offset,
        }, scanSignal);
        if (result.records.length + result.failures.length > PAGE_SIZE) {
          throw new Error("Albion returned more events than the requested page size.");
        }
      } catch (error) {
        if (scanSignal.aborted) break;
        if (pendingEvents.size === 0 && fetchedIds.size === 0 && recoveries.length === 0) throw error;
        options.logger.error("Pagination failed; retaining pending work and retrying the scan next cycle.", error);
        pageWasFull = false;
        break;
      }
      pageWasFull = result.records.length + result.failures.length === PAGE_SIZE;
      failures += result.failures.length;
      const pageIds = new Set<number>();

      if (page === 0) {
        // Failures keep their original indices; records keep their relative order.
        const failuresByIndex = new Map(result.failures.map((failure) => [failure.index, failure]));
        let recordIndex = 0;
        for (let index = 0; index < result.records.length + result.failures.length; index++) {
          const failure = failuresByIndex.get(index);
          const id = failure ? failure.eventId : result.records[recordIndex++]?.id;
          if (isUsableId(id)) {
            newestId = id;
            break;
          }
        }
      }

      for (const event of result.records) {
        if (!isUsableId(event.id)) {
          failures++;
          options.logger.warn("Cannot process Albion event without a usable event ID.", { id: event.id });
          continue;
        }
        pageIds.add(event.id);
        if (recentIds.has(event.id)) remember(event.id);
        else pendingEvents.set(event.id, event);
      }
      for (const failure of result.failures) {
        options.logger.warn("Malformed Albion event", failure);
        const id = failure.eventId;
        if (!isUsableId(id)) {
          options.logger.warn("Cannot retry malformed event without a usable event ID.", failure);
          continue;
        }
        pageIds.add(id);
        if (recentIds.has(id) || pendingEvents.has(id) || failedIds.has(id)) continue;
        if (failedIds.size === MAX_FAILED_IDS) {
          const exhausted = [...failedIds].find(([, attempts]) => attempts >= MAX_RECOVERY_ATTEMPTS);
          if (exhausted) failedIds.delete(exhausted[0]);
          else {
            options.logger.warn("Recovery queue full; event cannot be retained.", { id });
            continue;
          }
        }
        failedIds.set(id, 0);
      }

      const madeProgress = [...pageIds].some((id) => !fetchedIds.has(id));
      for (const id of pageIds) fetchedIds.add(id);
      if (!pageWasFull || (completedScanBoundary !== undefined && pageIds.has(completedScanBoundary))) {
        scanCompleted = true;
        pageWasFull = false;
        break;
      }
      if (pageIds.size > 0 && !madeProgress) {
        options.logger.warn("Pagination made no progress; older events may be unavailable.");
        pageWasFull = false;
        break;
      }
      if (offset === MAX_FEED_OFFSET) {
        scanCompleted = true;
        pageWasFull = false;
        break;
      }
    }

    if (signal?.aborted) return { newEvents, failures };
    newEvents += await handlePending(signal);
    if (scanCompleted && !signal?.aborted && newestId !== undefined) {
      if (completedScanBoundary !== undefined && !fetchedIds.has(completedScanBoundary)) {
        options.logger.warn("Previous scan boundary was not found; some events may no longer be available.");
      }
      completedScanBoundary = newestId;
    }
    for (const [id, attempts] of recoveries) {
      if (cycleSignal.aborted) break;
      if (!failedIds.has(id)) continue;
      try {
        const event = await options.client.getEvent(id, cycleSignal);
        if (event.id !== id) throw new Error("Recovered event ID does not match the requested ID.");
        pendingEvents.set(id, event);
        failedIds.delete(id);
      } catch (error) {
        if (signal?.aborted) break;
        // Rotate failed attempts to give other IDs their turn next cycle.
        failedIds.delete(id);
        failedIds.set(id, attempts + 1);
        options.logger.warn(attempts + 1 < MAX_RECOVERY_ATTEMPTS
          ? "Could not recover Albion event; retrying next cycle."
          : "Recovery attempts exhausted; event needs feed rediscovery or durable recovery.", { id, error });
      }
    }
    if (signal?.aborted) return { newEvents, failures };
    newEvents += await handlePending(signal);

    if (scanSignal.aborted || cycleSignal.aborted) {
      options.logger.warn("Worker API time budget exhausted; further API work deferred.");
    } else if (pageWasFull) {
      options.logger.warn(`Stopped at WORKER_MAX_PAGES=${maxPages}; older events may be missed.`);
    }
    options.logger.info(`Cycle complete: ${newEvents} new event(s), ${failures} malformed event(s).`);
    return { newEvents, failures };
  }

  async function run(signal: AbortSignal) {
    while (!signal.aborted) {
      try {
        await runCycle(signal);
      } catch (error) {
        if (!signal.aborted) options.logger.error("Worker cycle failed; retrying next cycle.", error);
      }

      if (signal.aborted) break;
      try {
        await sleep(options.intervalMs, undefined, { signal });
      } catch (error) {
        if (signal.aborted) break;
        throw error;
      }
    }
  }

  return { runCycle, run };
}
