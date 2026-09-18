-- CreateTable
CREATE TABLE "KillEventItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "quality" INTEGER,
    "count" INTEGER,

    CONSTRAINT "KillEventItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KillEventItem_itemType_idx" ON "KillEventItem"("itemType");

-- CreateIndex
CREATE UNIQUE INDEX "KillEventItem_eventId_role_slot_key" ON "KillEventItem"("eventId", "role", "slot");

-- AddForeignKey
ALTER TABLE "KillEventItem" ADD CONSTRAINT "KillEventItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "KillEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
