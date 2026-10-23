import { prisma } from "./client";

export function createWorkerStateStore(region: string, database = prisma.ingestionState) {
  return {
    async read() {
      const state = await database.findUnique({ where: { region } });
      return {
        consecutiveFailures: state?.consecutiveFailures ?? 0,
        alerted: state?.alerted ?? false,
        consecutiveBoundaryMisses: state?.consecutiveBoundaryMisses ?? 0,
        boundaryAlerted: state?.boundaryAlerted ?? false,
      };
    },
    async write(state: { consecutiveFailures: number; alerted: boolean; consecutiveBoundaryMisses?: number; boundaryAlerted?: boolean }) {
      const data = { ...state, consecutiveBoundaryMisses: state.consecutiveBoundaryMisses ?? 0,
        boundaryAlerted: state.boundaryAlerted ?? false };
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
