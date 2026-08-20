/*
  Warnings:

  - You are about to drop the column `playerId` on the `Player` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[external_player_id]` on the table `Player` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Player" ADD COLUMN "external_player_id" TEXT,
ADD COLUMN "region" TEXT;

-- Migrate data
UPDATE "Player" SET "external_player_id" = "playerId";
UPDATE "Player" SET "region" = 'EU' WHERE "region" IS NULL;

-- Make columns NOT NULL
ALTER TABLE "Player" ALTER COLUMN "external_player_id" SET NOT NULL,
ALTER COLUMN "region" SET NOT NULL;

-- DropIndex
DROP INDEX "Player_playerId_key";

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "playerId";

-- CreateIndex
CREATE UNIQUE INDEX "Player_external_player_id_key" ON "Player"("external_player_id");
