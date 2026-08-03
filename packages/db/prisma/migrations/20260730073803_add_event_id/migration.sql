/*
  Warnings:

  - You are about to drop the column `killerName` on the `KillEvent` table. All the data in the column will be lost.
  - You are about to drop the column `victimName` on the `KillEvent` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[eventId]` on the table `KillEvent` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `eventId` to the `KillEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalFame` to the `KillEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "KillEvent" DROP COLUMN "killerName",
DROP COLUMN "victimName",
ADD COLUMN     "eventId" TEXT NOT NULL,
ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "totalFame" BIGINT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "KillEvent_eventId_key" ON "KillEvent"("eventId");

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_killerId_fkey" FOREIGN KEY ("killerId") REFERENCES "Player"("playerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "Player"("playerId") ON DELETE RESTRICT ON UPDATE CASCADE;
