-- Enable pg_trgm extension for trigram similarity search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop the plain B-tree name indexes from
-- 20260923030000_add_name_search_indexes (PLAYERS-31, PR #19).
-- Trigram indexes below replace them: B-tree indexes cannot serve
-- substring search (`ILIKE '%foo%'`), trigram indexes can.
DROP INDEX IF EXISTS "Player_name_idx";
DROP INDEX IF EXISTS "Guild_name_idx";
DROP INDEX IF EXISTS "Alliance_name_idx";

-- GIN trigram indexes: substring search on the three name columns.
CREATE INDEX "Player_name_trgm_idx"
  ON "Player"   USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Guild_name_trgm_idx"
  ON "Guild"    USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Alliance_name_trgm_idx"
  ON "Alliance" USING GIN ("name" gin_trgm_ops);
