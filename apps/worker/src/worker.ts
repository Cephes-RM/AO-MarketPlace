import { setTimeout as sleep } from "node:timers/promises";
import type {
  AlbionClient,
  AlbionBatchResult,
  AlbionKillboardEvent,
} from "@albion/albion-client";
import { safeError, type createIngestionMonitor, type RunContext } from "./monitor";

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
  onEvents(events: AlbionKillboardEvent[], context?: RunContext): Promise<void>;
  maxPages?: number;
  cycleTimeoutMs?: number;
  intervalMs: number;
  logger: Pick<Console, "info" | "warn" | "error">;
  monitor?: ReturnType<typeof createIngestionMonitor>;
  stateStore?: {
    readBoundary(): Promise<number | undefined>;
    writeBoundary(id: number): Promise<void>;
  };
}

function isUsableId(id: number | undefined): id is number {
  return id !== undefined && Number.isSafeInteger(id) && id > 0;
}

export function createWorker(options: WorkerOptions) {
  const recentIds = new Set<number>();
  // Assumes newest-first publication; delayed events below the boundary may be missed.
  let completedScanBoundary: number | undefined;
  let boundaryLoaded = false;
  let context: RunContext | undefined;
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
    const lookup = () => options.findExistingIds([...pendingEvents.keys()].map(String));
    const existingIds = await (context ? context.stage("existing_ids", lookup) : lookup());
    if (signal?.aborted) return 0;
    const newEvents = [...pendingEvents.values()].filter((event) => !existingIds.has(String(event.id)));
    context?.skip("already_persisted", pendingEvents.size - newEvents.length);
    if (newEvents.length > 0) {
      const handle = () => options.onEvents(newEvents, context);
      await (context ? context.stage("event_handler", handle) : handle());
    }
    for (const id of pendingEvents.keys()) {
      remember(id);
      failedIds.delete(id);
    }
    pendingEvents.clear();
    return newEvents.length;
  }

  async function performCycle(signal?: AbortSignal) {
    if (signal?.aborted) return { newEvents: 0, failures: 0 };
    if (!boundaryLoaded && options.stateStore) {
      const read = () => options.stateStore!.readBoundary();
      completedScanBoundary = await (context ? context.stage("worker_state", read) : read());
      boundaryLoaded = true;
    }
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
    let scanError: unknown;
    let recoveryError: unknown;

    for (let page = 0; page < maxPages; page += 1) {
      if (scanSignal.aborted) break;
      const offset = Math.min(page * PAGE_SIZE, MAX_FEED_OFFSET);
      let result: AlbionBatchResult<AlbionKillboardEvent>;
      try {
        const fetchPage = () => options.client.getRecentEventsTolerant({
          limit: PAGE_SIZE,
          offset,
        }, scanSignal);
        result = await (context ? context.stage("fetch", fetchPage) : fetchPage());
        if (result.records.length + result.failures.length > PAGE_SIZE) {
          throw new Error("Albion returned more events than the requested page size.");
        }
      } catch (error) {
        scanError = error;
        if (scanSignal.aborted) break;
        if (pendingEvents.size === 0 && fetchedIds.size === 0 && recoveries.length === 0) throw error;
        options.logger.error("Pagination failed; retaining pending work and retrying the scan next cycle.", safeError(error));
        pageWasFull = false;
        break;
      }
      pageWasFull = result.records.length + result.failures.length === PAGE_SIZE;
      context?.fetched(result.records.length + result.failures.length);
      context?.skip("malformed", result.failures.length);
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
          context?.skip("invalid_id");
          options.logger.warn("Cannot process Albion event without a usable event ID.", { id: event.id });
          continue;
        }
        pageIds.add(event.id);
        if (recentIds.has(event.id)) {
          remember(event.id);
          context?.skip("already_processed");
        } else {
          if (pendingEvents.has(event.id)) context?.skip("duplicate");
          pendingEvents.set(event.id, event);
        }
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

      context?.feed(pageIds.size === 0 ? undefined : Math.max(...pageIds));
      for (const id of pageIds) fetchedIds.add(id);
      if (!pageWasFull || (completedScanBoundary !== undefined && pageIds.has(completedScanBoundary))) {
        scanCompleted = true;
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
    if (scanCompleted && completedScanBoundary !== undefined && !fetchedIds.has(completedScanBoundary)) {
      context?.boundaryMiss();
      options.logger.warn("Previous scan boundary was not found; some events may no longer be available.");
    }
    newEvents += await handlePending(signal);
    for (const [id, attempts] of recoveries) {
      if (cycleSignal.aborted) break;
      if (!failedIds.has(id)) continue;
      try {
        const recover = () => options.client.getEvent(id, cycleSignal);
        const event = await (context ? context.stage("event_recovery", recover) : recover());
        context?.fetched(1);
        if (event.id !== id) throw new Error("Recovered event ID does not match the requested ID.");
        pendingEvents.set(id, event);
        failedIds.delete(id);
      } catch (error) {
        if (signal?.aborted) break;
        recoveryError = error;
        // Rotate failed attempts to give other IDs their turn next cycle.
        failedIds.delete(id);
        failedIds.set(id, attempts + 1);
        options.logger.warn(attempts + 1 < MAX_RECOVERY_ATTEMPTS
          ? "Could not recover Albion event; retrying next cycle."
          : "Recovery attempts exhausted; event needs feed rediscovery or durable recovery.", { id, error: safeError(error) });
      }
    }
    if (signal?.aborted) return { newEvents, failures };
    newEvents += await handlePending(signal);

    const retryableRecovery = [...failedIds.values()].some((attempts) => attempts < MAX_RECOVERY_ATTEMPTS);
    if (scanCompleted && !cycleSignal.aborted && !recoveryError && newestId !== undefined
      && (!options.stateStore || !retryableRecovery)) {
      if (options.stateStore) {
        const save = () => options.stateStore!.writeBoundary(newestId!);
        await (context ? context.stage("worker_state", save) : save());
      }
      completedScanBoundary = newestId;
    }

    if (scanSignal.aborted || cycleSignal.aborted) {
      options.logger.warn("Worker API time budget exhausted; further API work deferred.");
    } else if (pageWasFull) {
      options.logger.warn(`Stopped at WORKER_MAX_PAGES=${maxPages}; older events may be missed.`);
    }
    options.logger.info(`Cycle complete: ${newEvents} new event(s), ${failures} malformed event(s).`);
    // Partial results can be handled without reporting an incomplete scan as healthy.
    if (context && !scanCompleted && !signal?.aborted) {
      await context.stage("fetch", () => { throw scanError ?? new Error("Feed scan did not complete within the worker limits"); });
    }
    if (context && recoveryError && !signal?.aborted) {
      await context.stage("event_recovery", () => { throw recoveryError; });
    }
    return { newEvents, failures };
  }

  async function runCycle(signal?: AbortSignal) {
    if (!options.monitor || signal?.aborted) return performCycle(signal);
    let result = { newEvents: 0, failures: 0 };
    await options.monitor.run(async (current) => {
      context = current;
      try { result = await performCycle(signal); }
      finally { context = undefined; }
    }, signal);
    return result;
  }

  async function run(signal: AbortSignal) {
    while (!signal.aborted) {
      try {
        await runCycle(signal);
      } catch (error) {
        if (!signal.aborted) options.logger.error("Worker cycle failed; retrying next cycle.", safeError(error));
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

  return { runCycle, run, onRetry: () => context?.retry() };
}
