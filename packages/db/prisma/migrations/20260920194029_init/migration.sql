-- CreateTable
CREATE TABLE "Alliance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allianceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "fame" BIGINT NOT NULL,
    "killFame" BIGINT NOT NULL,
    "deathFame" BIGINT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildMembership" (
    "playerId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GuildMembership_pkey" PRIMARY KEY ("playerId","guildId","joinedAt")
);

-- CreateTable
CREATE TABLE "KillEvent" (
    "id" TEXT NOT NULL,
    "killerId" TEXT NOT NULL,
    "victimId" TEXT NOT NULL,
    "killerLoadout" JSONB,
    "victimLoadout" JSONB,
    "killerItemPower" DOUBLE PRECISION,
    "victimItemPower" DOUBLE PRECISION,
    "location" TEXT NOT NULL,
    "totalFame" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KillEvent_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "Alliance_name_key" ON "Alliance"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_name_key" ON "Guild"("name");

-- CreateIndex
CREATE INDEX "GuildMembership_playerId_joinedAt_idx" ON "GuildMembership"("playerId", "joinedAt");

-- CreateIndex
CREATE INDEX "GuildMembership_guildId_idx" ON "GuildMembership"("guildId");

-- CreateIndex
CREATE INDEX "KillParticipant_playerId_idx" ON "KillParticipant"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "KillParticipant_killEventId_playerId_key" ON "KillParticipant"("killEventId", "playerId");

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

--enforce one current guild per player
CREATE UNIQUE INDEX "GuildMembership_one_current_per_player" ON "GuildMembership" ("playerId") WHERE "leftAt" IS NULL;

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_killerId_fkey" FOREIGN KEY ("killerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillParticipant" ADD CONSTRAINT "KillParticipant_killEventId_fkey" FOREIGN KEY ("killEventId") REFERENCES "KillEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillParticipant" ADD CONSTRAINT "KillParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
