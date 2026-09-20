-- AlterTable: Rename primary keys on Alliance, Guild, Player from external_*_id to id
ALTER TABLE "Alliance" RENAME COLUMN "external_alliance_id" TO "id";
ALTER TABLE "Guild" RENAME COLUMN "external_guild_id" TO "id";
ALTER TABLE "Player" RENAME COLUMN "external_player_id" TO "id";

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "KillEvent" ADD COLUMN "killerLoadout" JSONB,
ADD COLUMN "victimLoadout" JSONB,
ADD COLUMN "killerItemPower" DOUBLE PRECISION,
ADD COLUMN "victimItemPower" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "KillParticipant" (
    "id" TEXT NOT NULL,
    "killEventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "damageDone" INTEGER,
    "healingDone" INTEGER,
    "killFame" BIGINT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "loadout" JSONB,
    "itemPower" DOUBLE PRECISION,

    CONSTRAINT "KillParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KillParticipant_killEventId_playerId_key" ON "KillParticipant"("killEventId", "playerId");

-- CreateIndex
CREATE INDEX "KillParticipant_playerId_idx" ON "KillParticipant"("playerId");

-- AddForeignKey
ALTER TABLE "KillParticipant" ADD CONSTRAINT "KillParticipant_killEventId_fkey" FOREIGN KEY ("killEventId") REFERENCES "KillEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillParticipant" ADD CONSTRAINT "KillParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
