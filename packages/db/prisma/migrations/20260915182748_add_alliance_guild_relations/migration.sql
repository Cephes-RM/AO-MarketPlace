/*
  Warnings:

  - A unique constraint covering the columns `[external_alliance_id]` on the table `Alliance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[external_guild_id]` on the table `Guild` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `external_alliance_id` to the `Alliance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `external_guild_id` to the `Guild` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Guild" DROP CONSTRAINT "Guild_allianceId_fkey";

-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_guildId_fkey";

-- AlterTable
ALTER TABLE "Alliance" ADD COLUMN     "external_alliance_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "external_guild_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_external_alliance_id_key" ON "Alliance"("external_alliance_id");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_external_guild_id_key" ON "Guild"("external_guild_id");

-- AddForeignKey
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("external_alliance_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("external_guild_id") ON DELETE SET NULL ON UPDATE CASCADE;
