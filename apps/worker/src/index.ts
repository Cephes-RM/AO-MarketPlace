import { createAlbionClient, isAlbionRegion } from "@albion/albion-client";
import { prisma, writeIngestBatch } from "@albion/db";
import { mapKillEvents } from "./ingest-mapping.ts";
import { createWorker } from "./worker.ts";

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

const worker = createWorker({
  client: createAlbionClient({ region, includeRaw: true }).gameinfo,
  intervalMs: positiveInteger("WORKER_INTERVAL_MS", 600_000, 2_147_483_647),
  cycleTimeoutMs: positiveInteger("WORKER_CYCLE_TIMEOUT_MS", 120_000, 2_147_483_647),
  maxPages: positiveInteger("WORKER_MAX_PAGES", 100),
  logger: console,
  async findExistingIds(ids) {
    if (ids.length === 0) return new Set();
    const rows = await prisma.killEvent.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  },
  async onEvents(events) {
    const { batch, skipped } = mapKillEvents(events, region);
    for (const entry of skipped) console.warn("Skipped Albion event that cannot be stored.", entry);
    // Database outages throw here, so the worker keeps the events pending and retries.
    const started = performance.now();
    const result = await writeIngestBatch(batch, { logger: console });
    const seconds = (performance.now() - started) / 1000;
    // Rate covers every event the writer handled, including skipped ones, since each costs write time.
    const perSecond = seconds > 0 ? batch.events.length / seconds : 0;
    console.info(
      `Stored ${result.written} of ${events.length} event(s); skipped ${result.skipped + skipped.length}; ` +
        `write took ${seconds.toFixed(2)}s (${perSecond.toFixed(1)} events/s).`,
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
