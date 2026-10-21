# Local Database Benchmarking

This guide describes how to inspect and benchmark the performance of the `Player`, `Guild`, and `Alliance` queries in AO-MarketPlace using a local PostgreSQL database.

The goal is to evaluate performance under realistic data volumes without affecting shared development, staging, or production databases.

## 1. Performance Targets

The target is **p95 latency below 300 ms** for each of the following read paths:

- Player name search.
- Guild page, including member counts and fame totals.
- Alliance page, including member counts and fame totals.

These targets must be verified against representative data and workloads. They should not be considered achieved until repeatable benchmark measurements confirm them.

## 2. Why Use a Local Database?

The cloud development database may contain too few records to represent production workloads accurately. Small datasets can hide expensive queries and make inefficient operations appear fast.

A dedicated local database allows developers to:

- Test with large datasets.
- Inspect PostgreSQL query execution plans.
- Evaluate index usage and aggregation queries.
- Compare performance under consistent test conditions.
- Avoid loading shared databases with synthetic benchmark data.

Run destructive operations, including bulk data generation, `TRUNCATE`, and index changes, only against the dedicated benchmark database.

## 3. Prerequisites

| Requirement | Purpose |
|---|---|
| Docker Desktop | Runs PostgreSQL locally |
| Node.js and npm | Runs Prisma commands |
| Project dependencies | Provides the Prisma schema and client |
| Sufficient disk space and RAM | Supports the database, indexes, and test data |

Use a PostgreSQL version compatible with the project's database configuration. For meaningful comparisons, keep the database version and test environment consistent.

## 4. Start PostgreSQL

Start a dedicated PostgreSQL container:

```bash
docker run --name ao-marketplace-benchmark \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=benchmark_password \
  -p 5433:5432 \
  -d postgres:18
```

Port `5433` avoids conflicts with a local PostgreSQL instance using port `5432`.

Create the benchmark database:

```bash
docker exec ao-marketplace-benchmark \
  psql -U postgres \
  -c 'CREATE DATABASE "AO-db";'
```

Configure the connection string for your local benchmark environment:

```text
postgresql://postgres:benchmark_password@localhost:5433/AO-db
```

Set the appropriate Prisma database environment variables to use this connection. If the project uses both `DATABASE_URL` and `DIRECT_URL`, configure both for the local benchmark database.

**Important:** never use a shared or production database for benchmark data or destructive testing.

## 5. Apply Database Migrations

From the project workspace containing the relevant Prisma schema, apply the migrations:

```bash
npx prisma migrate deploy
```

Use the repository's configured Prisma schema path and package scripts if they differ from this example.

Verify that the required tables and indexes exist. For example, in `psql`:

```sql
\d "Player"
\d "Guild"
\d "Alliance"
```

The name-search optimization uses PostgreSQL's `pg_trgm` extension and GIN trigram indexes on the `name` columns of `Player`, `Guild`, and `Alliance`.

Verify that the extension is enabled:

```sql
SELECT extname
FROM pg_extension
WHERE extname = 'pg_trgm';
```

## 6. Prepare Representative Data

Performance measurements should use enough records to expose bottlenecks that are not visible in a small development database.

An example target dataset is:

| Table | Target row count |
|---|---:|
| `Alliance` | 10,000 |
| `Guild` | 100,000 |
| `Player` | 1,000,000 |
| `GuildMembership` | 1,000,000 or more, depending on membership history |

These figures are example benchmark targets, not the current database row counts.

The dataset should reflect realistic name distributions, membership relationships, fame values, and active versus historical memberships.

Before running the benchmark, ensure the dataset has been generated and that the required indexes and migrations are present. If an automated seed process is unavailable, document the data-generation method used for the test so results can be reproduced.

## 7. Inspect Name-Search Query Plans

Player, guild, and alliance name searches may use substring matching such as `ILIKE '%foo%'`. A conventional B-tree index generally cannot efficiently support arbitrary leading-wildcard searches. Trigram indexes can help PostgreSQL accelerate these queries.

Inspect the player search query:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM "Player"
WHERE name ILIKE '%cer%';
```

Inspect guild search:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM "Guild"
WHERE name ILIKE '%atlas%';
```

Inspect alliance search:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM "Alliance"
WHERE name ILIKE '%atlas%';
```

Review the query plan for:

- Whether PostgreSQL uses the expected index.
- Execution time.
- Rows scanned and rows returned.
- Buffer hits and disk reads.

Test with multiple search terms, including terms that match few rows and terms that match many rows.

A sequential scan does not necessarily indicate a problem. PostgreSQL may choose one when the table is small or the search matches a large proportion of the table.

## 8. Inspect Guild and Alliance Aggregations

Guild and alliance pages should calculate member counts and fame totals in SQL rather than retrieving every member record into application memory solely for aggregation.

Use `EXPLAIN (ANALYZE, BUFFERS)` to inspect the actual queries used by the application for guild and alliance pages.

Verify that:

- Member counts follow the intended active-membership rules.
- Fame totals match the application's business logic.
- Historical memberships are handled correctly.
- The application does not unnecessarily fetch every member row just to calculate totals.
- Query performance remains acceptable for guilds and alliances with many members.

Check both query performance and result correctness.

## 9. Measure Latency

`EXPLAIN ANALYZE` helps diagnose database query performance, but its execution time is not the same as end-to-end application latency.

To evaluate the p95 target:

1. Prepare a representative dataset and verify the database schema.
2. Execute each relevant read path repeatedly under a consistent workload.
3. Record individual latency measurements.
4. Calculate p50, p95, p99, and maximum latency.
5. Record the dataset size, PostgreSQL version, hardware, and test conditions.
6. Compare the p95 latency of each read path with the 300 ms target.

Use application-level measurements when evaluating the complete player-search, guild-page, and alliance-page experience. Keep database-only measurements separate from endpoint latency.

## 10. Record Results

Record actual measurements in a table such as the following:

| Read path | p50 | p95 | p99 | Target |
|---|---:|---:|---:|---:|
| Player search | Not measured | Not measured | Not measured | < 300 ms |
| Guild page | Not measured | Not measured | Not measured | < 300 ms |
| Alliance page | Not measured | Not measured | Not measured | < 300 ms |

Replace the placeholders with measured values after running the benchmark. Do not treat the target as achieved without repeatable measurements.

## 11. Troubleshooting

**PostgreSQL does not use a trigram index**

- Confirm that `pg_trgm` is enabled.
- Confirm that the GIN index exists on the correct column.
- Run `ANALYZE` after loading or significantly changing the dataset.
- Test with realistic data and search terms. The planner may prefer a sequential scan when it estimates that this is cheaper.

**Queries are unexpectedly fast**

- Check whether the dataset is large enough to represent the intended workload.
- Confirm that the query returns representative results.
- Distinguish cached execution from cold-cache execution.

**Results vary between runs**

- Keep hardware, dataset, PostgreSQL configuration, and workload consistent.
- Run enough iterations to calculate meaningful percentiles.
- Record whether the database was warm or cold and avoid comparing unlike test conditions.

**Benchmark results cannot be reproduced**

- Document the data-generation method and database version.
- Record the exact queries or endpoints tested.
- Record the relevant configuration and the commands used to run the tests.