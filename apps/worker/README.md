# Albion ingestion worker

From the repository root, create `.env` from `.env.example` and set the Neon
`DATABASE_URL` and `DIRECT_URL`. Apply the committed database migrations through
your team's normal migration process before starting this version, then run
`docker compose up --build`. The worker
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
when scanning times out. Page and time limits produce warnings about
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

The monitor failure count, alert-delivery flag
and completed scan boundary are stored in one `IngestionState` row per region.
The boundary is restored after restart and saved only after a completed scan's
existing-ID lookup and both feed and recovery handlers succeed. It stays
unchanged while known recovery IDs still have attempts remaining. Monitor writes
and boundary writes update separate columns, so neither overwrites the other's
state.

Pending work, failed IDs, and the processed-ID cache remain in memory and are
lost on restart. Saving the boundary does not make those queues durable or
guarantee event persistence. Run one worker replica per region; this state
table does not provide multi-worker locking.

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

Every scheduled cycle now runs through `createIngestionMonitor`. Client
`onRetry` notifications increment that cycle's retry metric. Failed API scans,
including partial or capped scans, are reported as failures even if their
partial events were handled. Failed stages are `fetch`, `event_recovery`,
`existing_ids`, `event_handler`, `worker_state` or `monitor_state`.
Shutdown observed before monitor-state persistence reports `cancelled` without
resetting an existing incident. If shutdown arrives after successful work and
its reset write has started, that write can finish normally and report success.
Database outages accumulate failures and confirmed alert delivery in memory;
when storage recovers, pending incident state is reconciled and saved. This
unsaved state cannot survive a restart while the database remains unavailable.
Delivery and its database acknowledgment are separate: a failed acknowledgment
is logged and retried without resending in the same process. A crash between
delivery and acknowledgment can still produce a duplicate after restart.

`INGESTION_FAILURE_THRESHOLD` defaults to `3`. Set `DISCORD_WEBHOOK_URL` to the
team-approved webhook through platform secrets. Until task 4.7 inserts events,
`written` is always zero: successfully logged new events have skip reason
`not_persisted`. Other reasons include `malformed`, `invalid_id`, `duplicate`,
`already_processed` and `already_persisted`. Fetched/skipped counts describe
records encountered, including overlapping pages, not just unique events.

### Missing-boundary monitoring

Each existing "Previous scan boundary was not found" warning increments
`boundaryMisses` in that run's structured log. Warnings are counted after a
completed scan, before handlers and recovery, so their failures or queued work
cannot hide a coverage warning. Boundary persistence still waits for the
success checks described above. `consecutiveBoundaryMisses` counts affected
runs, not the number of warnings or missing kills. It uses
the same threshold (default `3`) and sends a separate polling-interval alert
that recommends polling more often. A run can finish successfully and still
raise this coverage alert; normal execution-failure alerts remain independent.

A run with zero boundary warnings resets the streak and its alert flag, even
if execution failed. This tracks consecutive warning-bearing runs; a reset is
not proof of healthy coverage during an outage. Shutdown does not change the
streak. Both the streak and its
alert flag are persisted in the same `IngestionState` row and restored on
restart. Delivery failures are retried on later affected runs; confirmed
delivery is suppressed until a clean run resets the incident.

A missing boundary signals possible coverage gaps, not an exact number of
missed kills. Too-long polling intervals are one cause; inconsistent or delayed
API responses can also contribute. This alert does not automatically change
the configured interval or recover unavailable history.

### Feed-stall monitoring

A successful feed read records its highest observed event ID. Only an ID above
the saved high-water mark resets `lastNewEventAt`; event timestamps and detail
recoveries do not. This follows the worker's existing increasing-ID feed
assumption. Repeated or empty feed responses for two hours trigger a separate
`feed_stall` Discord alert. A feed that keeps delivering new IDs an hour late
does not alert just because its timestamps lag behind the clock.

`newestFeedEventId`, `feedIdleMs`, and `feedStallAlertStatus` are included in each
structured run. Activity and confirmed alert delivery are saved in the existing
state table. Arrivals observed before shutdown are saved even if the run is
cancelled; that run sends no alerts and leaves failure and boundary counters
unchanged. Delivery retries and incident reset work independently of other
alerts. Failed fetches alone do not trigger this alert; they retain the existing
execution-failure alert. A stopped process needs the separate heartbeat monitor.

### Approved live alert test (PLAYERS-49)

After deployment, coordinate with the team before changing the running worker:

1. Configure the team webhook in platform secrets. Temporarily set
   `INGESTION_FAILURE_THRESHOLD=1` for the within-one-cycle alert check.
2. Set `ALBION_GAMEINFO_BASE_URL` to
   `https://gameinfo-ams.albiononline.com/api/gameinfo/intentional-failure/`
   and restart/redeploy through the platform. This overrides only the shared
   client's URL; the worker still uses the client for every API request.
3. Verify a structured `ingestion.run` failure with `failedStage: "fetch"` and
   `alertStatus: "sent"`, plus the matching stage-labelled message in Discord.
4. Clear the URL override, restore threshold `3`, and restart/redeploy. Confirm
   a successful cycle resets the failure count and alert flag. Separately
   verify three consecutive failed cycles produce one alert at threshold `3`.

Do not leave the broken URL configured. These steps send real messages and
interrupt ingestion; local tests use mocks and do not perform this live test.
