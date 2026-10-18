import { prisma } from "./client";
import type { Prisma, PrismaClient, GuildMembership } from "@prisma/client";

export interface SimulateGuildChangeInput {
  playerId: string;
  guildId: string | null;
  effectiveAt?: Date;
}

export type GuildTransitionType =
  | "NO_CHANGE"
  | "INITIAL_MEMBERSHIP"
  | "TRANSFER"
  | "GUILD_TO_GUILDLESS"
  | "GUILDLESS_TO_GUILD";

export interface GuildChangeResult {
  changed: boolean;
  transition: GuildTransitionType;
  previousGuildId: string | null;
  currentGuildId: string | null;
  closedMembership: GuildMembership | null;
  newMembership: GuildMembership | null;
}

/**
 * Detects whether a player's guild has changed and records it in history.
 *
 * PostgreSQL enforces that a player can have at most one open membership (`leftAt IS NULL`)
 * via the `GuildMembership_one_current_per_player` partial unique index.
 *
 * When a transfer occurs, the previous open membership is closed (`leftAt = effectiveAt`)
 * before creating the new membership, all within a single transaction.
 */
export async function simulateGuildChange(
  playerIdOrInput: string | SimulateGuildChangeInput,
  guildIdArg?: string | null | PrismaClient | Prisma.TransactionClient,
  effectiveAtArg?: Date | PrismaClient | Prisma.TransactionClient,
  clientArg?: PrismaClient | Prisma.TransactionClient,
): Promise<GuildChangeResult> {
  let playerId: string;
  let newGuildId: string | null;
  let effectiveAt: Date;
  let client: PrismaClient | Prisma.TransactionClient;

  if (typeof playerIdOrInput === "object" && playerIdOrInput !== null) {
    playerId = playerIdOrInput.playerId;
    newGuildId = playerIdOrInput.guildId ?? null;
    effectiveAt = playerIdOrInput.effectiveAt ?? new Date();
    client = (guildIdArg as PrismaClient | Prisma.TransactionClient) ?? prisma;
  } else {
    playerId = playerIdOrInput;
    newGuildId = typeof guildIdArg === "string" || guildIdArg === null ? guildIdArg : null;
    effectiveAt = effectiveAtArg instanceof Date ? effectiveAtArg : new Date();
    client =
      clientArg ??
      (guildIdArg && typeof guildIdArg === "object" && "$transaction" in guildIdArg
        ? (guildIdArg as PrismaClient)
        : prisma);
  }

  // Treat empty string as guildless (null)
  if (newGuildId === "") {
    newGuildId = null;
  }

  const runInTransaction = async (tx: Prisma.TransactionClient): Promise<GuildChangeResult> => {
    // 1. Find player's currently active membership (leftAt IS NULL)
    const currentMembership = await tx.guildMembership.findFirst({
      where: {
        playerId,
        leftAt: null,
      },
    });

    const currentGuildId = currentMembership?.guildId ?? null;

    // Case 1: No change -> write nothing
    if (currentGuildId === newGuildId) {
      return {
        changed: false,
        transition: "NO_CHANGE",
        previousGuildId: currentGuildId,
        currentGuildId: newGuildId,
        closedMembership: null,
        newMembership: currentMembership,
      };
    }

    let transition: GuildTransitionType;
    let closedMembership: GuildMembership | null = null;
    let newMembership: GuildMembership | null = null;

    // Case 2: Player currently has an active membership -> close it first
    if (currentMembership) {
      const closeTime =
        effectiveAt < currentMembership.joinedAt ? currentMembership.joinedAt : effectiveAt;

      closedMembership = await tx.guildMembership.update({
        where: {
          playerId_guildId_joinedAt: {
            playerId: currentMembership.playerId,
            guildId: currentMembership.guildId,
            joinedAt: currentMembership.joinedAt,
          },
        },
        data: {
          leftAt: closeTime,
        },
      });

      if (newGuildId === null) {
        transition = "GUILD_TO_GUILDLESS";
      } else {
        transition = "TRANSFER";
      }
    } else {
      // Player had no active membership
      const totalHistoryCount = await tx.guildMembership.count({
        where: { playerId },
      });

      if (totalHistoryCount === 0) {
        transition = "INITIAL_MEMBERSHIP";
      } else {
        transition = "GUILDLESS_TO_GUILD";
      }
    }

    // Case 3: Player joined a new guild -> open new membership
    if (newGuildId !== null) {
      newMembership = await tx.guildMembership.create({
        data: {
          playerId,
          guildId: newGuildId,
          joinedAt: effectiveAt,
          leftAt: null,
        },
      });
    }

    return {
      changed: true,
      transition,
      previousGuildId: currentGuildId,
      currentGuildId: newGuildId,
      closedMembership,
      newMembership,
    };
  };

  if ("$transaction" in client && typeof client.$transaction === "function") {
    return await client.$transaction(runInTransaction);
  }

  return await runInTransaction(client as Prisma.TransactionClient);
}

/** Alias for simulateGuildChange */
export const recordGuildChange = simulateGuildChange;
