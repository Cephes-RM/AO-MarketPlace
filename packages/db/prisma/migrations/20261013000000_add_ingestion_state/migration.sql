CREATE TABLE "IngestionState" (
    "region" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "consecutiveBoundaryMisses" INTEGER NOT NULL DEFAULT 0,
    "boundaryAlerted" BOOLEAN NOT NULL DEFAULT false,
    "scanBoundary" BIGINT,
    "lastFeedEventId" BIGINT,
    "lastNewEventAt" TIMESTAMP(3),
    "feedStallAlerted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "IngestionState_pkey" PRIMARY KEY ("region")
);
