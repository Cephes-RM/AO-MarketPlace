-- AlterTable
ALTER TABLE "KillEvent" ADD COLUMN "raw" JSONB,
ADD COLUMN "battleId" TEXT,
ADD COLUMN "occurredAt" TIMESTAMP(3);

-- Existing seed rows only have a fight time in createdAt.
UPDATE "KillEvent" SET "occurredAt" = "createdAt";

ALTER TABLE "KillEvent" ALTER COLUMN "occurredAt" SET NOT NULL;

ALTER TABLE "KillEvent" ALTER COLUMN "location" DROP NOT NULL;

ALTER TABLE "KillEvent" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
