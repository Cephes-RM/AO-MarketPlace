-- Enable pg_trgm extension for trigram similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex: GIN trigram index on Player.name for fast ILIKE / similarity search
CREATE INDEX "Player_name_trgm_idx" ON "Player" USING GIN ("name" gin_trgm_ops);

-- CreateIndex: GIN trigram index on Guild.name for fast ILIKE / similarity search
CREATE INDEX "Guild_name_trgm_idx" ON "Guild" USING GIN ("name" gin_trgm_ops);

-- CreateIndex: GIN trigram index on Alliance.name for fast ILIKE / similarity search
CREATE INDEX "Alliance_name_trgm_idx" ON "Alliance" USING GIN ("name" gin_trgm_ops);
