/*
  Warnings:

  - You are about to drop the column `occurredAt` on the `KillEvent` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "KillEvent" DROP CONSTRAINT "KillEvent_killerId_fkey";

-- DropForeignKey
ALTER TABLE "KillEvent" DROP CONSTRAINT "KillEvent_victimId_fkey";

-- AlterTable
ALTER TABLE "KillEvent" DROP COLUMN "occurredAt",
ALTER COLUMN "createdAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_killerId_fkey" FOREIGN KEY ("killerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KillEvent" ADD CONSTRAINT "KillEvent_victimId_fkey" FOREIGN KEY ("victimId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
