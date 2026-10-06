import { createAlbionClient, isAlbionRegion } from "@albion/albion-client";
import { prisma } from "@albion/db";
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
  client: createAlbionClient({ region }).gameinfo,
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
    console.info(`Fetched ${events.length} unpersisted event(s).`);
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
