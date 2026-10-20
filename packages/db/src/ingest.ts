import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client";
import type { PlayerLoadout } from "./loadout";

export interface IngestAlliance {
  id: string;
  name: string;
  /** True when Albion sent no name and `name` is a stand-in (tag or ID); it never replaces a stored name. */
  nameIsFallback: boolean;
}

export interface IngestGuild {
  id: string;
  name: string;
  /** True when Albion sent no name and `name` is the ID; it never replaces a stored name. */
  nameIsFallback: boolean;
  allianceId: string | null;
}

/** Lifetime fame is deliberately absent: it only ever comes from the player endpoint. */
export interface IngestPlayer {
  id: string;
  name: string;
  region: string;
}

export interface IngestParticipant {
  playerId: string;
  damageDone: number | null;
  healingDone: number | null;
  /** Fame from this one fight, not the player's lifetime total. */
  killFame: bigint | null;
  isPrimary: boolean;
  itemPower: number | null;
  loadout: PlayerLoadout;
}

export interface IngestKillEvent {
  id: string;
  killerId: string;
  victimId: string;
  raw: Prisma.InputJsonValue;
  battleId: string | null;
  occurredAt: Date;
  location: string | null;
  totalFame: bigint;
  killerItemPower: number | null;
  victimItemPower: number | null;
  killerLoadout: PlayerLoadout;
  victimLoadout: PlayerLoadout;
  participants: IngestParticipant[];
}

/** Fetched data ready to store. IDs are Albion IDs; each list holds one entry per ID. */
export interface IngestBatch {
  alliances: IngestAlliance[];
  guilds: IngestGuild[];
  players: IngestPlayer[];
  events: IngestKillEvent[];
}

/** Counts kill events, the unit the worker reports on. */
export interface IngestResult {
  written: number;
  skipped: number;
}

type IngestClient = Pick<PrismaClient, "alliance" | "guild" | "player" | "$transaction">;

interface IngestOptions {
  logger: Pick<Console, "warn">;
  client?: IngestClient;
}

// BigInt(0), not 0n: apps/web compiles this package for a target without BigInt literals.
const NO_FAME = BigInt(0);

// Errors caused by the row's own data. Anything else (connection loss, pool or
// transaction timeouts, deadlocks) is rethrown so the worker retries the batch.
const CONSTRAINT_ERROR_CODES = new Set([
  "P2000", "P2002", "P2003", "P2004", "P2011", "P2012", "P2014", "P2020", "P2023",
]);

export function isConstraintError(error: unknown): boolean {
  return error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    CONSTRAINT_ERROR_CODES.has(String((error as { code?: unknown }).code));
}

function errorCode(error: unknown) {
  return (error as { code?: unknown }).code;
}

// PlayerLoadout is plain JSON, but as an interface it lacks the index signature Prisma expects.
function loadoutJson(loadout: PlayerLoadout) {
  return loadout as Prisma.InputJsonObject;
}

/**
 * Upserts a batch in foreign-key order: alliances, guilds, players, then each
 * event with its participants in one transaction. Re-running the same batch
 * leaves the data unchanged. A row that violates a constraint is logged and
 * skipped; an event whose row fails is counted as skipped.
 */
export async function writeIngestBatch(batch: IngestBatch, options: IngestOptions): Promise<IngestResult> {
  const client = options.client ?? prisma;

  async function attempt(kind: string, id: string, write: () => Promise<unknown>) {
    try {
      await write();
      return true;
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      options.logger.warn(`Skipped ${kind} that violates a database constraint.`, {
        id,
        code: errorCode(error),
      });
      return false;
    }
  }

  // A fallback name only fills a new row; existing rows keep whatever name they have.
  for (const { id, name, nameIsFallback } of batch.alliances) {
    await attempt("alliance", id, () => client.alliance.upsert({
      where: { id },
      create: { id, name },
      update: nameIsFallback ? {} : { name },
    }));
  }

  for (const { id, name, nameIsFallback, allianceId } of batch.guilds) {
    await attempt("guild", id, () => client.guild.upsert({
      where: { id },
      create: { id, name, allianceId },
      update: nameIsFallback ? { allianceId } : { name, allianceId },
    }));
  }

  for (const player of batch.players) {
    await attempt("player", player.id, () => client.player.upsert({
      where: { id: player.id },
      create: { ...player, fame: NO_FAME, killFame: NO_FAME, deathFame: NO_FAME },
      // Never touch fame or region here; only the name can change between fights.
      update: { name: player.name },
    }));
  }

  const result: IngestResult = { written: 0, skipped: 0 };
  for (const { id, participants, ...event } of batch.events) {
    const fields = {
      ...event,
      killerLoadout: loadoutJson(event.killerLoadout),
      victimLoadout: loadoutJson(event.victimLoadout),
    };
    const stored = await attempt("kill event", id, () => client.$transaction(async (tx) => {
      await tx.killEvent.upsert({ where: { id }, create: { id, ...fields }, update: fields });
      for (const { playerId, loadout, ...participant } of participants) {
        const data = { ...participant, loadout: loadoutJson(loadout) };
        await tx.killParticipant.upsert({
          where: { killEventId_playerId: { killEventId: id, playerId } },
          create: { killEventId: id, playerId, ...data },
          update: data,
        });
      }
    }, { timeout: 30_000 }));
    if (stored) result.written += 1;
    else result.skipped += 1;
  }
  return result;
}
