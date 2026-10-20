# Albion ingestion worker

From the repository root, create `.env` from `.env.example` and set the Neon
`DATABASE_URL` and `DIRECT_URL`, then run `docker compose up --build`. The worker
starts immediately and waits `WORKER_INTERVAL_MS` after each cycle finishes
before starting the next (default: 10 minutes). `ALBION_REGION` defaults to
`europe`. API calls use `@albion/albion-client`; existing IDs are read and new
events are written through the shared Prisma client in `@albion/db` (see
"Storing events" below).

The first cycle scans the available feed in pages of 51, within the limits
below. After a scan completes and its handler succeeds, it remembers the newest
event ID. Later cycles read from the newest page until reaching the page with
that saved ID, rather than rescanning all history. Only that boundary stops
the scan; other known IDs are filtered without stopping pagination. A short
page also completes the scan. Failed, capped, or timed-out scans
leave the boundary unchanged. A missing previous boundary produces a warning.

Repeated full pages do not end a scan: later offsets can still contain unseen
events. IDs are deduplicated, and offset, page-count and time limits keep the
scan bounded. The shared client gives each feed read a unique `_` query value
to avoid reusing stale cached page URLs; detail endpoints are unchanged.

This policy assumes newest-first publication. Events published late below the
boundary, or omitted by a response or moving offset pagination, may be missed.
Known failed IDs are still retried separately; they do not depend on scanning
older pages. This is incremental polling, not a guarantee of complete history.

`WORKER_MAX_PAGES` defaults to 100, but the events endpoint accepts offsets
only up to 1000. Scans fetch the final page at offset 1000 and stop there, even
when it is full. This completes the accessible feed window, not all event
history. The final page overlaps the
previous page; event IDs are deduplicated before handling.

`WORKER_CYCLE_TIMEOUT_MS` defaults to 120000
and bounds API work, including retries and response bodies. Half of that budget
is reserved for scanning and the remainder allows recovery to progress even
when scanning times out. Page, time, and state limits produce warnings about
incomplete work. Each scan starts at offset zero; these limits can prevent
older history from being reached. The time budget does not cancel database
queries or the handler; database connection/query timeouts must be configured
through the database connection. SIGINT/SIGTERM cancel API requests, backoff,
and interval sleep. Compose allows 30 seconds for shutdown.

Malformed events with positive safe-integer IDs are queued for `getEvent(id)`
on later cycles. Fresh scan results reach the handler before recovery. Up to
five queued IDs are attempted per cycle, and unsuccessful IDs rotate to the
back. Each ID gets at most five worker recovery attempts (each may include the
shared client's HTTP retries). Exhausted IDs are retained as suppression
entries; a later valid feed record can still be handled. The queue holds at
most 1000 IDs, replacing exhausted entries when needed and reporting overflow
when all entries are active. Evicted IDs may become eligible again if the feed
repeats them. Records without usable IDs are logged as individually unrecoverable.

Fetched events remain pending until their existing-ID lookup and handler
succeed. Pending work is retried before fetching more, so a database or handler
outage cannot keep accumulating scans. Scan IDs, pending records, and the
processed-ID cache each hold at most 10000 entries. The cache keeps recently
seen processed IDs, including across empty responses. Consecutive identical
successful cycles within that retained window do not repeat the event handler;
regular cycle logs and HTTP reads still occur. Evicted IDs may be reported again.

Pending work, failed IDs, and deduplication state are lost on restart. Events
already stored are filtered by the existing-ID lookup, and writes are upserts,
so reprocessing after a restart does not duplicate rows.

The 4.1 measurement did not prove the feed's retention window. Events that
disappear before being fetched cannot be recovered without knowing their IDs;
complete coverage at the default interval is not guaranteed.

## Storing events

The event handler maps new events with `mapKillEvents` (`src/ingest-mapping.ts`)
and writes them with `writeIngestBatch` from `@albion/db`:

- Rows are upserted in foreign-key order: alliances, guilds, players, then each
  kill event together with its participants in one transaction. Keys are Albion
  IDs (participants use event ID plus player ID), so writing the same batch
  twice leaves the data unchanged; only `updatedAt` moves.
- Every event stores `raw`, `battleId` and `occurredAt`. `raw` is the original
  payload, kept by the client's `includeRaw` option, with null, empty-string,
  empty-array and empty-object values removed (including Albion's null padding
  for empty inventory slots). Everything else stays as Albion sent it.
- Equipment for the killer, the victim and each participant is stored as
  `PlayerLoadout` (`main_hand`, `body`, `shoe`, ...). Empty slots are omitted.
- Lifetime fame (`fame`, `killFame`, `deathFame`) never comes from an event.
  Players first seen in a fight are created with 0, and later writes only
  update their name. Guild and alliance names, and a guild's alliance, follow
  the most recent fight.
- Guild memberships are not written here (PLAYERS-42).
- A row that violates a database constraint is logged with its ID and skipped,
  and its event counts as skipped. Other database errors (connection loss,
  pool or transaction timeouts, deadlocks) are rethrown, so the events stay
  pending and are retried next cycle. Events without a parseable timestamp or
  raw payload are logged and skipped before writing.
- `writeIngestBatch` returns `{ written, skipped }` event counts for monitoring.

Writes take roughly half a second per event against Neon, so the first scan of a
full feed window (about 1,050 events) spends several minutes writing. The cycle
timeout does not bound this database time.

## Monitoring and alerts

The monitoring modules provide structured cycle metrics, consecutive-failure
tracking and confirmed Discord alert delivery. The monitor reports fetched,
written and skipped records, skip reasons, HTTP retries, elapsed time and the
failed stage. It sends one alert per incident after the configured threshold,
retries unsuccessful delivery and clears the incident after recovery. Logged
errors redact URLs, and alert messages disable Discord mentions.

Run `pnpm --filter worker monitor:demo` from the repository root for the local
simulation. It uses mocked API requests and a mocked Discord notifier: three
failed cycles produce one simulated alert, followed by a healthy cycle that
resets the incident. It does not access the database or send real messages.

`INGESTION_FAILURE_THRESHOLD` defaults to `3`. `DISCORD_WEBHOOK_URL` is reserved
for the team-approved webhook and should be supplied through platform secrets.
These settings are not wired into `src/index.ts` by this change. Integrating
the monitor around the existing worker cycle and persisting its state in the
database are a separate follow-up ticket with Marwane. The existing scheduler,
`WORKER_*` settings and event handler remain the runtime entry point.
