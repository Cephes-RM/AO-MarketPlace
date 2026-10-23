CREATE TABLE "IngestionState" (
    "region" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "consecutiveBoundaryMisses" INTEGER NOT NULL DEFAULT 0,
    "boundaryAlerted" BOOLEAN NOT NULL DEFAULT false,
    "scanBoundary" BIGINT,
    CONSTRAINT "IngestionState_pkey" PRIMARY KEY ("region")
);
