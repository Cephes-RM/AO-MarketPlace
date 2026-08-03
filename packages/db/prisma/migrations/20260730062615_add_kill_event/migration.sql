-- CreateTable
CREATE TABLE "KillEvent" (
    "id" TEXT NOT NULL,
    "killerId" TEXT NOT NULL,
    "victimId" TEXT NOT NULL,
    "killerName" TEXT NOT NULL,
    "victimName" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KillEvent_pkey" PRIMARY KEY ("id")
);
