import { prisma } from "./client";

function validateFeedActivity(id: number | undefined, at: number | undefined) {
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new Error("Invalid ingestion feed event ID");
  if (at !== undefined && (!Number.isSafeInteger(at) || at < 0 || !Number.isFinite(new Date(at).getTime()))) {
    throw new Error("Invalid ingestion feed activity time");
  }
}

export function createWorkerStateStore(region: string, database = prisma.ingestionState) {
  return {
    async read() {
      const state = await database.findUnique({ where: { region } });
      const lastFeedEventId = state?.lastFeedEventId == null ? undefined : Number(state.lastFeedEventId);
      const lastNewEventAt = state?.lastNewEventAt?.getTime();
      validateFeedActivity(lastFeedEventId, lastNewEventAt);
      return {
        consecutiveFailures: state?.consecutiveFailures ?? 0,
        alerted: state?.alerted ?? false,
        consecutiveBoundaryMisses: state?.consecutiveBoundaryMisses ?? 0,
        boundaryAlerted: state?.boundaryAlerted ?? false,
        ...(lastNewEventAt === undefined ? {} : {
          lastNewEventAt,
          ...(lastFeedEventId === undefined ? {} : { lastFeedEventId }),
          feedStallAlerted: state?.feedStallAlerted ?? false,
        }),
      };
    },
    async write(state: { consecutiveFailures: number; alerted: boolean; consecutiveBoundaryMisses?: number; boundaryAlerted?: boolean;
      lastFeedEventId?: number; lastNewEventAt?: number; feedStallAlerted?: boolean }) {
      const { lastFeedEventId, lastNewEventAt, ...incident } = state;
      validateFeedActivity(lastFeedEventId, lastNewEventAt);
      const data = { ...incident, consecutiveBoundaryMisses: state.consecutiveBoundaryMisses ?? 0,
        boundaryAlerted: state.boundaryAlerted ?? false,
        ...(lastFeedEventId === undefined ? {} : { lastFeedEventId: BigInt(lastFeedEventId) }),
        ...(lastNewEventAt === undefined ? {} : { lastNewEventAt: new Date(lastNewEventAt) }),
      };
      await database.upsert({ where: { region }, create: { region, ...data }, update: data });
    },
    async readBoundary() {
      const state = await database.findUnique({ where: { region } });
      if (state?.scanBoundary == null) return undefined;
      const id = Number(state.scanBoundary);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid ingestion scan boundary");
      return id;
    },
    async writeBoundary(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid ingestion scan boundary");
      const scanBoundary = BigInt(id);
      // Update only the boundary; monitor writes must preserve it, and vice versa.
      await database.upsert({ where: { region }, create: { region, scanBoundary }, update: { scanBoundary } });
    },
  };
}
