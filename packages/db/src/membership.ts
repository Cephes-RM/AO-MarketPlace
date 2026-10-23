import type { PrismaClient } from "@prisma/client";

type MembershipClient = Pick<PrismaClient, "guildMembership">;

/**
 * Detects a guild change for a player and records it atomically.
 *
 * Rules
 * ─────
 * • First-seen player (no existing open membership):
 *     If guildId is non-null → open a new membership.
 *     If guildId is null     → no-op (guildless and unknown: nothing to record).
 *
 * • Stale observation:
 *     If `now` is earlier than the open membership's `joinedAt`, return
 *     without writing (a delayed fight or season backfill must not overwrite
 *     newer history).
 *
 * • Known player with an open membership:
 *     Same guild → no-op (idempotent).
 *     Different guild (or guildless) → close the old membership then, if the
 *     new guildId is non-null, open a new one. Both writes share `now` as the
 *     transition timestamp so the history is gapless.
 *
 * The caller must supply a Prisma transaction client so the close + open pair
 * is atomic. The database enforces that each (playerId, guildId, joinedAt)
 * tuple is unique, meaning a second open row for the same guild is rejected at
 * the DB level.
 *
 * @param tx      Prisma interactive-transaction client (or a plain client for testing).
 * @param playerId Albion player ID.
 * @param guildId  Current guild ID from the API, or null when the player is guildless.
 * @param now      Timestamp used as `leftAt` for the closed row and `joinedAt` for the new one.
 */
export async function syncGuildMembership(
  tx: MembershipClient,
  playerId: string,
  guildId: string | null,
  now: Date,
): Promise<void> {
  // Find the current open membership (leftAt IS NULL).
  const open = await tx.guildMembership.findFirst({
    where: { playerId, leftAt: null },
    select: { guildId: true, joinedAt: true },
  });

  // Guard against stale observations: a late fight or backfill must not overwrite newer history.
  if (open !== null && now.getTime() < open.joinedAt.getTime()) return;

  const currentGuildId = open?.guildId ?? null;

  // Idempotent: same guild, nothing to do.
  if (currentGuildId === guildId) return;

  // Close the old open membership if one exists.
  if (open !== null) {
    await tx.guildMembership.update({
      where: {
        playerId_guildId_joinedAt: {
          playerId,
          guildId: open.guildId,
          joinedAt: open.joinedAt,
        },
      },
      data: { leftAt: now },
    });
  }

  // Open a new membership if the player has a guild.
  if (guildId !== null) {
    await tx.guildMembership.create({
      data: { playerId, guildId, joinedAt: now },
    });
  }
}
