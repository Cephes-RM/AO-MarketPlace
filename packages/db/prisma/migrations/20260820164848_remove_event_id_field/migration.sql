/*
  Warnings:

  - You are about to drop the column `eventId` on the `KillEvent` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "KillEvent_eventId_key";

-- AlterTable
ALTER TABLE "KillEvent" DROP COLUMN "eventId";
