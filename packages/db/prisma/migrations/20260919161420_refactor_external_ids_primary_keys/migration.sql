/*
  Warnings:

  - The primary key for the `Alliance` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Alliance` table. All the data in the column will be lost.
  - The primary key for the `Guild` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Guild` table. All the data in the column will be lost.
  - The primary key for the `GuildMembership` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `GuildMembership` table. All the data in the column will be lost.
  - The primary key for the `Player` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `alliance` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `Player` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "GuildMembership" DROP CONSTRAINT "GuildMembership_playerId_fkey";

-- DropForeignKey
ALTER TABLE "GuildMembership" DROP CONSTRAINT "GuildMembership_guildId_fkey";

-- DropForeignKey
ALTER TABLE "Guild" DROP CONSTRAINT "Guild_allianceId_fkey";

-- DropForeignKey
ALTER TABLE "KillEvent" DROP CONSTRAINT "KillEvent_killerId_fkey";

-- DropForeignKey
ALTER TABLE "KillEvent" DROP CONSTRAINT "KillEvent_victimId_fkey";

-- DropIndex
DROP INDEX "Alliance_external_alliance_id_key";

-- DropIndex
DROP INDEX "Guild_external_guild_id_key";

-- DropIndex
DROP INDEX "Player_external_player_id_key";

-- AlterTable
ALTER TABLE "Alliance" DROP CONSTRAINT "Alliance_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Alliance_pkey" PRIMARY KEY ("external_alliance_id");

-- AlterTable
ALTER TABLE "Guild" DROP CONSTRAINT "Guild_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Guild_pkey" PRIMARY KEY ("external_guild_id");

-- AlterTable
ALTER TABLE "GuildMembership" DROP CONSTRAINT "GuildMembership_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "GuildMembership_pkey" PRIMARY KEY ("playerId", "guildId", "joinedAt");

-- AlterTable
ALTER TABLE "Player" DROP CONSTRAINT "Player_pkey",
DROP COLUMN "alliance",
DROP COLUMN "id",
ADD CONSTRAINT "Player_pkey" PRIMARY KEY ("external_player_id");

-- AddForeignKey
ALTER TABLE "GuildMembership" ADD CONSTRAINT "GuildMembership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("external_player_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_killerId_fkey" FOREIGN KEY ("killerId") REFERENCES "Player"("external_player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "Player"("external_player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
