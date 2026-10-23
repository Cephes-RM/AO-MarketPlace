import { createAlbionClient, isAlbionRegion } from "@albion/albion-client";
import { createWorkerStateStore, prisma, writeIngestBatch } from "@albion/db";
import { mapKillEvents } from "./ingest-mapping.ts";
import { createWorker } from "./worker.ts";
import { createIngestionMonitor } from "./monitor";
import { discordNotifier } from "./discord";

const region = process.env.ALBION_REGION ?? "europe";
if (!isAlbionRegion(region)) {
  throw new Error("ALBION_REGION must be west, europe, or east.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the worker.");
}

function positiveInteger(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (value > maximum) throw new Error(`${name} must be at most ${maximum}.`);
  return value;
}

const store = createWorkerStateStore(region);
const monitor = createIngestionMonitor({
  region,
  store,
  failureThreshold: positiveInteger("INGESTION_FAILURE_THRESHOLD", 3),
  sendAlert: process.env.DISCORD_WEBHOOK_URL ? discordNotifier(process.env.DISCORD_WEBHOOK_URL) : undefined,
});
const worker: ReturnType<typeof createWorker> = createWorker({
  client: createAlbionClient({
    region,
    includeRaw: true,
    baseUrl: process.env.ALBION_GAMEINFO_BASE_URL || undefined,
    onRetry: () => worker.onRetry(),
  }).gameinfo,
  monitor,
  stateStore: store,
  intervalMs: positiveInteger("WORKER_INTERVAL_MS", 600_000, 2_147_483_647),
  cycleTimeoutMs: positiveInteger("WORKER_CYCLE_TIMEOUT_MS", 120_000, 2_147_483_647),
  maxPages: positiveInteger("WORKER_MAX_PAGES", 100),
  logger: console,
  async findExistingIds(ids) {
    const rows = await prisma.killEvent.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  },
  async onEvents(events, context) {
    const { batch, skipped } = mapKillEvents(events, region);
    for (const entry of skipped) {
      console.warn("Skipped Albion event that cannot be stored.", entry);
      context?.skip(entry.reason);
    }
    // Database outages throw here, so the worker keeps the events pending and retries.
    const write = () => writeIngestBatch(batch, { logger: console, onProgress: ({ written, skipped }) => {
      context?.written(written);
      context?.skip("database_constraint", skipped);
    } });
    const result = await (context ? context.stage("write", write) : write());
    console.info(
      `Stored ${result.written} of ${events.length} event(s); skipped ${result.skipped + skipped.length}.`,
    );
  },
});

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

try {
  await worker.run(controller.signal);
} finally {
  await prisma.$disconnect();
}
