# Albion ingestion worker

From the repository root, create `.env` from `.env.example` and set the Neon
`DATABASE_URL` and `DIRECT_URL`, then run `docker compose up --build`. The worker
starts immediately and waits `WORKER_INTERVAL_MS` after each cycle finishes
before starting the next (default: 10 minutes). `ALBION_REGION` defaults to
`europe`. API calls use `@albion/albion-client`; existing IDs are read through
the shared Prisma client in `@albion/db`.

The first cycle scans the available feed in pages of 51, within the limits
below. After a scan completes and its handler succeeds, it remembers the newest
event ID. Later cycles read from the newest page until reaching the page with
that saved ID, rather than rescanning all history. Only that boundary stops
the scan; other known IDs are filtered without stopping pagination. A short
page also completes the scan. Failed, capped, timed-out, or repeated-page scans
leave the boundary unchanged. A missing previous boundary produces a warning.

This policy assumes newest-first publication. Events published late below the
boundary, or omitted by a response or moving offset pagination, may be missed.
Known failed IDs are still retried separately; they do not depend on scanning
older pages. This is incremental polling, not a guarantee of complete history.

`WORKER_MAX_PAGES` defaults to 100. `WORKER_CYCLE_TIMEOUT_MS` defaults to 120000
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

This PLAYERS-40 handler only logs new events; it writes nothing. PLAYERS-41
(4.7) adds database upserts. Pending work, failed IDs, and deduplication state
are lost on restart; restart/durable idempotency is not claimed by this service.

The 4.1 measurement did not prove the feed's retention window. Events that
disappear before being fetched cannot be recovered without knowing their IDs;
complete coverage at the default interval is not guaranteed.

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
