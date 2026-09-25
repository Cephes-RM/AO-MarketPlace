-- CreateIndex
CREATE INDEX "KillEvent_killerId_occurredAt_idx" ON "KillEvent"("killerId", "occurredAt");

-- CreateIndex
CREATE INDEX "KillEvent_victimId_occurredAt_idx" ON "KillEvent"("victimId", "occurredAt");

-- CreateIndex
CREATE INDEX "KillEvent_battleId_idx" ON "KillEvent"("battleId");
