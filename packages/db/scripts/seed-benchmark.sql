-- scripts/seed-benchmark.sql
-- Seeds a local Postgres with production-scale synthetic data:
--   10,000 alliances / 100,000 guilds / 1,000,000 players / 1,000,000 active memberships
--
-- Usage:
--   docker exec -i pg-tutorial psql -U postgres -d "AO-db" < scripts/seed-benchmark.sql
--
-- Notes:
--   * Uses deterministic id prefixes (a_, g_, p_) so the benchmark can pick
--     random ids without a secondary lookup.
--   * Every player has exactly ONE active membership (leftAt IS NULL), which
--     satisfies the partial unique index GuildMembership_one_current_per_player.
--   * Memberships are power-law distributed: some guilds are large, most are
--     small. This makes aggregate queries non-trivial to benchmark.

BEGIN;
SET LOCAL synchronous_commit = off;
SET LOCAL maintenance_work_mem = '1GB';
SET LOCAL work_mem = '256MB';

TRUNCATE TABLE
  "KillParticipant", "KillEvent",
  "GuildMembership", "Player", "Guild", "Alliance"
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- 1) Alliances (10,000)
-- ---------------------------------------------------------------------------
INSERT INTO "Alliance" ("id", "name", "rating", "stars", "updatedAt")
SELECT
  'a_' || lpad(g::text, 6, '0'),
  'Alliance ' || g || ' [' || upper(substr(md5(random()::text), 1, 4)) || ']',
  (random() * 1000)::int,
  (random() *    5)::int,
  now()
FROM generate_series(1, 10000) AS g;

-- ---------------------------------------------------------------------------
-- 2) Guilds (100,000, 10 per alliance)
-- ---------------------------------------------------------------------------
INSERT INTO "Guild" ("id", "name", "allianceId", "rating", "stars", "updatedAt")
SELECT
  'g_' || lpad(g::text, 7, '0'),
  'Guild ' || g || ' [' || upper(substr(md5(random()::text), 1, 4)) || ']',
  'a_' || lpad(((g - 1) / 10 + 1)::text, 6, '0'),
  (random() * 1000)::int,
  (random() *    5)::int,
  now()
FROM generate_series(1, 100000) AS g;

-- ---------------------------------------------------------------------------
-- 3) Players (1,000,000)
-- ---------------------------------------------------------------------------
INSERT INTO "Player"
  ("id", "name", "region", "fame", "killFame", "deathFame",
   "rating", "stars", "updatedAt")
SELECT
  'p_' || lpad(g::text, 8, '0'),
  'Player ' || g || '_' || substr(md5(random()::text), 1, 5),
  (ARRAY['EU','NA','SA','ASIA','OCE'])[1 + (random() * 4)::int],
  (random() * 100000000)::bigint,
  (random() *  50000000)::bigint,
  (random() *  20000000)::bigint,
  (random() *      1000)::int,
  (random() *         5)::int,
  now()
FROM generate_series(1, 1000000) AS g;

-- ---------------------------------------------------------------------------
-- 4) GuildMembership (1,000,000 active)
--    power(random(), 2) biases toward low guild ids -> skewed distribution.
-- ---------------------------------------------------------------------------
INSERT INTO "GuildMembership" ("playerId", "guildId", "joinedAt", "leftAt")
SELECT
  'p_' || lpad(g::text, 8, '0'),
  'g_' || lpad((1 + floor(power(random(), 2) * 99999))::int::text, 7, '0'),
  now() - (random() * interval '180 days'),
  NULL
FROM generate_series(1, 1000000) AS g;

COMMIT;

-- Refresh planner statistics -- without this the planner ignores the indexes.
VACUUM (ANALYZE) "Alliance";
VACUUM (ANALYZE) "Guild";
VACUUM (ANALYZE) "Player";
VACUUM (ANALYZE) "GuildMembership";