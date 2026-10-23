-- Guarantee at most one open membership per player at the database level.
CREATE UNIQUE INDEX "GuildMembership_playerId_open_unique_idx"
  ON "GuildMembership"("playerId")
  WHERE "leftAt" IS NULL;
