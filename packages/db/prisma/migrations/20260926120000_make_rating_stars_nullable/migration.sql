-- Add rating / stars to Guild and Alliance as nullable, no-default columns.
-- Idempotent: works whether the columns exist (from the Sep 21–25 window
-- when 497adb4 was live) or not (current main).

-- Alliance
ALTER TABLE "Alliance" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "Alliance" ADD COLUMN IF NOT EXISTS "stars"  INTEGER;
ALTER TABLE "Alliance" ALTER COLUMN "rating" DROP NOT NULL;
ALTER TABLE "Alliance" ALTER COLUMN "rating" DROP DEFAULT;
ALTER TABLE "Alliance" ALTER COLUMN "stars"  DROP NOT NULL;
ALTER TABLE "Alliance" ALTER COLUMN "stars"  DROP DEFAULT;
UPDATE "Alliance" SET "rating" = NULL, "stars" = NULL;

-- Guild
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "stars"  INTEGER;
ALTER TABLE "Guild" ALTER COLUMN "rating" DROP NOT NULL;
ALTER TABLE "Guild" ALTER COLUMN "rating" DROP DEFAULT;
ALTER TABLE "Guild" ALTER COLUMN "stars"  DROP NOT NULL;
ALTER TABLE "Guild" ALTER COLUMN "stars"  DROP DEFAULT;
UPDATE "Guild" SET "rating" = NULL, "stars" = NULL;

