-- CreateTable
CREATE TABLE "GuildMembership" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GuildMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuildMembership_playerId_joinedAt_idx" ON "GuildMembership"("playerId", "joinedAt");

-- CreateIndex
CREATE INDEX "GuildMembership_guildId_idx" ON "GuildMembership"("guildId");

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("external_guild_id") ON DELETE RESTRICT ON UPDATE CASCADE;