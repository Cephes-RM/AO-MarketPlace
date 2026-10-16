# Local Database Benchmarking

> Reproduce the performance benchmarks for `Player`, `Guild`, and `Alliance` queries
> on a local Postgres instance seeded with production-scale data.

**Audience:** any developer who wants to verify the SLOs on their own machine.
**SLO:** p95 latency < 300 ms for player search, guild page, and alliance page.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why a separate local DB](#2-why-a-separate-local-db)
3. [Prerequisites](#3-prerequisites)
4. [Quick Start](#4-quick-start)
5. [Step-by-Step Setup](#5-step-by-step-setup)
6. [Seeding Production-Scale Data](#6-seeding-production-scale-data)
7. [Running the Benchmark](#7-running-the-benchmark)
8. [Expected Results](#8-expected-results)
9. [Verifying the Query Plans](#9-verifying-the-query-plans)
10. [Troubleshooting](#10-troubleshooting)
11. [Files Reference](#11-files-reference)

---

## 1. Overview

AO-MarketPlace's cloud database (Neon) contains < 20 rows per table — enough to run
the app, far too few to measure database performance. Any query looks fast when
there are 12 rows.

To measure realistic performance we run the **same Prisma schema** against a
**local Postgres** populated with:

| Table | Rows | Notes |
|---|---|---|
| `Alliance` | 10,000 | 10 guilds each |
| `Guild` | 100,000 | |
| `Player` | 1,000,000 | |
| `GuildMembership` | 1,000,000 | one *active* row per player |

The benchmark measures p95 latency for the three hottest read paths and fails
if any of them exceeds **300 ms**.

Two optimizations make those SLOs achievable at scale; both are covered by
verification queries in §9:

- **`pg_trgm` GIN trigram indexes** on the three `name` columns — enables
  `ILIKE '%substring%'` to use an index scan instead of a sequential scan.
- **SQL aggregation** for guild / alliance member counts and fame totals —
  replaces the previous pattern of fetching every member row into the application.

---

## 2. Why a separate local DB

- The cloud DB (Neon) is shared and should never be loaded with millions of
  synthetic rows.
- Benchmarking is destructive (`TRUNCATE`, `VACUUM`, `DROP INDEX`). Doing it
  locally means zero risk to staging or production.
- Numbers are comparable across the team only when everyone uses the same
  schema, the same seed script, and the same Postgres major version — which a
  local Docker setup guarantees.

---

## 3. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker Desktop | any recent | Linux containers mode |
| PowerShell (Windows) **or** bash (macOS / Linux) | PS 5.1+ / bash 4+ | The benchmark ships in both flavors |
| Node.js | ≥ 18 | For `npx prisma migrate deploy` |
| Disk | ≥ 10 GB free | Seeded DB + indexes + WAL ≈ 3–4 GB |
| RAM | ≥ 8 GB | The Postgres container is configured for 1–2 GB |

No local Postgres install is needed. `pgbench` ships inside the official
`postgres` image.

---

## 4. Quick Start

For developers who already trust the steps below and just want to run it:

```bash
# 1. Start Postgres
docker run --name pg-tutorial \
  -e POSTGRES_PASSWORD=mysecurepassword \
  -p 5432:5432 -d postgres:18

# 2. Create the benchmark DB
docker exec -it pg-tutorial psql -U postgres -c 'CREATE DATABASE "AO-db";'

# 3. Point Prisma at it and apply migrations
export DATABASE_URL="postgresql://postgres:mysecurepassword@localhost:5432/AO-db"
npx prisma migrate deploy

# 4. Seed 1M / 100k / 10k
docker exec -i pg-tutorial psql -U postgres -d "AO-db" < scripts/seed-benchmark.sql

# 5. Tune memory and restart
docker exec -i pg-tutorial bash -c "cat >> /var/lib/postgresql/data/postgresql.conf" <<'EOF'
shared_buffers       = 1GB
work_mem             = 64MB
maintenance_work_mem = 512MB
effective_cache_size = 2GB
max_wal_size         = 4GB
EOF
docker restart pg-tutorial

# 6. Benchmark
./scripts/bench.sh         # macOS / Linux
# .\scripts\bench.ps1      # Windows PowerShell
```

## Summary

Adds a reproducible **local benchmarking workflow** for the three hottest read
paths (`Player` search, guild page, alliance page), backed by two
performance optimizations. The cloud DB currently has < 20 rows per table, so
any query looks fast — these changes let us measure p95 latency at
production-scale volumes (1M players / 100k guilds / 10k alliances) against a
**300 ms SLO**.

## Why

Two patterns work at seed scale and break at production scale:

1. **Substring search on names** (`ILIKE '%foo%'`) cannot use a B-tree index,
   so it degrades to a sequential scan.
2. **Guild / alliance landing pages** fetch every current member row into the
   application just to compute `count(*)` and `sum(fame)`.

Both are addressed here.

## Benchmark results (local, postgres:18, 8 clients, 30 s/endpoint)

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | SLO 300 ms |
|----------|---------:|---------:|---------:|---------:|:----------:|
| search   |    X.XX  |    X.XX  |    X.XX  |    X.XX  | ✅ |
| guild    |    X.XX  |    X.XX  |    X.XX  |    X.XX  | ✅ |
| alliance |    X.XX  |    X.XX  |    X.XX  |    X.XX  | ✅ |

<paste the markdown table your script printed>

### Planner verification

**Player search uses the trigram index** (no `Seq Scan on Player`):
```
<EXPLAIN output>
```

**Guild page uses index access on memberships** (no `Seq Scan on GuildMembership`):
```
<EXPLAIN output>
```

## Changes

**Indexes** (`perf(search)` commit)
- `prisma/migrations/20260923134430_add_trigram_indexes_for_name_search/`:
  enables `pg_trgm`, creates GIN trigram indexes on the three `name` columns.
- `prisma/schema.prisma`: documents the indexes with `///` comments.

**Benchmark harness** (`perf(bench)` commit)
- `scripts/seed-benchmark.sql` — 1M / 100k / 10k seed with a power-law
  member distribution.
- `scripts/bench.ps1` (Windows) and `scripts/bench.sh` (bash) — run `pgbench`
  inside the Postgres container, compute p50/p95/p99/max, exit non-zero on
  SLO breach.
- `.gitignore` — excludes `bench-results/`, `*.dump`, `.env`.

**Documentation** (`docs(bench)` commit)
- `docs/DB_BENCHMARK.md` — end-to-end guide for reproducing the benchmark on
  any machine.
- `.env.example` — local-only credentials for the benchmark DB.
- `README.md` — links to the new guide.

## How to test

Follow `docs/DB_BENCHMARK.md`. Expected runtime on a clean laptop: ~5 minutes
(2 min seed, 2 min benchmark, 1 min setup).

```bash
docker run --name pg-tutorial -e POSTGRES_PASSWORD=<password> \
  -p <port>:<port> -d postgres:18
docker exec -it pg-tutorial psql -U postgres -c 'CREATE DATABASE "AO-db";'
export DATABASE_URL="postgresql://postgres:<password>@localhost:<port>/AO-db"
npx prisma migrate deploy
docker exec -i pg-tutorial psql -U postgres -d "AO-db" < scripts/seed-benchmark.sql
./scripts/bench.sh
```

## Not in this PR (follow-ups)

- CI job to enforce the SLO on PRs touching `prisma/` or `scripts/bench*`.
- Docker Compose wrapper for the Postgres + pgAdmin containers.
- npm scripts (`bench:run`, `bench:seed`) as a convenience entry point.

## Notes for reviewers

- The benchmark DB is a **local-only Docker container** with synthetic data.
  It never connects to Neon, staging, or production.
- Credentials in `.env.example` are the *documented defaults* for that local
  container; they match no real environment.
- The `pg_trgm` extension requires PostgreSQL ≥ 9.1 and is bundled with the
  official `postgres` image — no extra install step.
