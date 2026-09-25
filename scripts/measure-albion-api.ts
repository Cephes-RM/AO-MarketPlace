import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createAlbionClient } from "@albion/albion-client";
import type { AlbionFetch } from "@albion/albion-client";

const OFFSETS = [0, 51, 102, 255] as const;
const EVENT_LIMIT = 51;
const FULL_RUN_SAMPLES = 24 * 60;
const FULL_RUN_INTERVAL_MS = 60_000;
const RESULTS_PATH = resolve(
  "fixtures/albion-api/europe/measurement.json",
);
const RAW_FIXTURE_PATH = resolve(
  "fixtures/albion-api/europe/events-sample.json",
);
const REPORT_PATH = resolve("docs/albion-api-measurement.md");

type ResponseCapture = {
  status: number | null;
  headers: Record<string, string>;
  rateLimitSigns: string[];
  rawPayload?: unknown;
};

type RequestMeasurement = {
  requestedAt: string;
  durationMs: number;
  offset: number;
  limit: number;
  ok: boolean;
  status: number | null;
  eventCount: number | null;
  eventIds: number[];
  newestEventAt: string | null;
  oldestEventAt: string | null;
  descendingByTime: boolean | null;
  responseHeaders: Record<string, string>;
  rateLimitSigns: string[];
  error?: string;
};

type MeasurementWithRawPayload = RequestMeasurement & {
  rawPayload?: unknown;
};

type MeasurementRun = {
  schemaVersion: 1;
  region: "europe";
  api: "official-gameinfo";
  startedAt: string;
  finishedAt: string | null;
  requestedSamples: number;
  completedSamples: number;
  intervalMs: number;
  offsets: number[];
  eventLimit: number;
  requests: RequestMeasurement[];
};

async function main(): Promise<void> {
  const requestedSamples = readIntegerEnv(
    "ALBION_MEASURE_SAMPLES",
    FULL_RUN_SAMPLES,
    { minimum: 1 },
  );
  const intervalMs = readIntegerEnv(
    "ALBION_MEASURE_INTERVAL_MS",
    FULL_RUN_INTERVAL_MS,
    { minimum: 0 },
  );
  const isNormalRun =
    requestedSamples === FULL_RUN_SAMPLES &&
    intervalMs === FULL_RUN_INTERVAL_MS;
  const run: MeasurementRun = {
    schemaVersion: 1,
    region: "europe",
    api: "official-gameinfo",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    requestedSamples,
    completedSamples: 0,
    intervalMs,
    offsets: [...OFFSETS],
    eventLimit: EVENT_LIMIT,
    requests: [],
  };

  await mkdir(dirname(RESULTS_PATH), { recursive: true });
  console.log(
    `Starting ${requestedSamples} Europe GameInfo request(s), interval ${intervalMs}ms.`,
  );

  for (let index = 0; index < requestedSamples; index += 1) {
    const offset = OFFSETS[index % OFFSETS.length];
    const measurement = await measureRequest(offset);
    const { rawPayload, ...persistedMeasurement } = measurement;
    run.requests.push(persistedMeasurement);
    run.completedSamples = run.requests.length;

    await maybeWriteRawFixture(persistedMeasurement, rawPayload);
    await persistRun(run);
    console.log(
      `[${run.completedSamples}/${requestedSamples}] offset=${offset} status=${measurement.status ?? "network-error"} events=${measurement.eventCount ?? "n/a"} duration=${measurement.durationMs}ms`,
    );

    if (index + 1 < requestedSamples && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }

  // The normal run stays alive through the final minute, making its observed
  // window a full 24 hours while keeping the request rate at one per minute.
  if (isNormalRun) {
    await sleep(intervalMs);
  }

  run.finishedAt = new Date().toISOString();
  await persistRun(run);
  console.log(`Measurement complete. Report: ${REPORT_PATH}`);
}

async function measureRequest(offset: number): Promise<MeasurementWithRawPayload> {
  const capture: ResponseCapture = {
    status: null,
    headers: {},
    rateLimitSigns: [],
  };
  const measuredFetch: AlbionFetch = async (url, init) => {
    const response = await fetch(url, init);
    capture.status = response.status;
    capture.headers = pickDiagnosticHeaders(response.headers);

    if (response.status === 429) {
      capture.rateLimitSigns.push("HTTP 429");
    }
    if (capture.headers["retry-after"] !== undefined) {
      capture.rateLimitSigns.push("retry-after header present");
    }
    if (capture.headers["x-ratelimit-remaining"] === "0") {
      capture.rateLimitSigns.push("x-ratelimit-remaining reached 0");
    }

    try {
      const responseText = await response.clone().text();
      if (/rate.?limit|too many requests/i.test(responseText)) {
        capture.rateLimitSigns.push("rate-limit text in response body");
      }
      capture.rawPayload = JSON.parse(responseText) as unknown;
    } catch {
      // The client will report invalid/non-JSON successful responses itself.
    }

    return response;
  };
  const client = createAlbionClient({ region: "europe", fetch: measuredFetch });
  const requestedAt = new Date().toISOString();
  const startedAt = performance.now();

  try {
    const events = await client.gameinfo.getRecentEvents({
      limit: EVENT_LIMIT,
      offset,
    });
    const timestamps = events.map((event) => event.occurredAt);

    return {
      requestedAt,
      durationMs: Math.round(performance.now() - startedAt),
      offset,
      limit: EVENT_LIMIT,
      ok: true,
      status: capture.status,
      eventCount: events.length,
      eventIds: events.map((event) => event.id),
      newestEventAt: timestamps[0] ?? null,
      oldestEventAt: timestamps.at(-1) ?? null,
      descendingByTime: isDescending(timestamps),
      responseHeaders: capture.headers,
      rateLimitSigns: unique(capture.rateLimitSigns),
      rawPayload: capture.rawPayload,
    };
  } catch (error) {
    return {
      requestedAt,
      durationMs: Math.round(performance.now() - startedAt),
      offset,
      limit: EVENT_LIMIT,
      ok: false,
      status: capture.status,
      eventCount: null,
      eventIds: [],
      newestEventAt: null,
      oldestEventAt: null,
      descendingByTime: null,
      responseHeaders: capture.headers,
      rateLimitSigns: unique(capture.rateLimitSigns),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function maybeWriteRawFixture(
  measurement: RequestMeasurement,
  payload: unknown,
): Promise<void> {
  if (!measurement.ok || !Array.isArray(payload) || payload.length === 0) {
    return;
  }
  if (
    process.env["ALBION_MEASURE_REFRESH_FIXTURE"] !== "1" &&
    (await fileExists(RAW_FIXTURE_PATH))
  ) {
    return;
  }

  await writeJsonAtomically(RAW_FIXTURE_PATH, payload.slice(0, 2));
}

async function persistRun(run: MeasurementRun): Promise<void> {
  await writeJsonAtomically(RESULTS_PATH, run);
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, buildReport(run), "utf8");
}

function buildReport(run: MeasurementRun): string {
  const successful = run.requests.filter((request) => request.ok);
  const failed = run.requests.length - successful.length;
  const elapsedMs = run.finishedAt
    ? Date.parse(run.finishedAt) - Date.parse(run.startedAt)
    : null;
  const observedIntervalMs =
    elapsedMs !== null && run.completedSamples > 0
      ? elapsedMs / run.completedSamples
      : null;
  const errorRate = run.requests.length
    ? (failed / run.requests.length) * 100
    : 0;
  const statusCounts = countBy(run.requests, (request) =>
    request.status === null ? "network error" : String(request.status),
  );
  const rateLimitCount = run.requests.filter(
    (request) => request.rateLimitSigns.length > 0,
  ).length;
  const isFinal =
    run.finishedAt !== null &&
    run.requestedSamples === FULL_RUN_SAMPLES &&
    run.completedSamples === FULL_RUN_SAMPLES &&
    run.intervalMs === FULL_RUN_INTERVAL_MS;
  const heading = isFinal ? "Final" : "Preliminary";

  return `# Albion Europe GameInfo API measurement

> **${heading} result.** Only a completed 24-hour run (1,440 requests at one
> request per minute) is classified as final.

## Run configuration

| Field | Value |
| --- | --- |
| API | Official Albion Europe GameInfo API |
| Endpoint family | \`/api/gameinfo/events\` |
| Started | ${run.startedAt} |
| Finished | ${run.finishedAt ?? "in progress / interrupted"} |
| Elapsed time | ${elapsedMs === null ? "in progress" : `${(elapsedMs / 3_600_000).toFixed(2)} hours`} |
| Requests | ${run.completedSamples} / ${run.requestedSamples} |
| Configured interval | ${formatInterval(run.intervalMs)} |
| Observed average interval | ${observedIntervalMs === null ? "not available" : `${(observedIntervalMs / 1_000).toFixed(2)} seconds`} |
| Limit | ${run.eventLimit} |
| Rotating offsets | ${run.offsets.join(", ")} |

## Reliability

| Metric | Observed |
| --- | ---: |
| Successful client calls | ${successful.length} |
| Failed client calls | ${failed} |
| Error rate | ${errorRate.toFixed(2)}% |
| Requests with 429/rate-limit signs | ${rateLimitCount} |

### HTTP status codes

${markdownCountTable(statusCounts, "Status")}

## Global events pagination

${paginationTable(run)}

Offsets are rotated across requests, so a normal run measures each offset 360
times without sending bursts. Event IDs are retained in the result JSON so page
overlap and movement can be inspected. Counts and first/last IDs below use the
latest successful observation for each offset.

${overlapTable(run)}

## Polling and retry recommendation

${recommendation(isFinal, errorRate, rateLimitCount)}

## Artifacts and scope

- \`fixtures/albion-api/europe/measurement.json\` contains per-request
  timing, status, selected response headers, event counts, and event IDs.
- \`fixtures/albion-api/europe/events-sample.json\` contains up to two raw,
  unmodified event objects captured from a successful API response.
- The measurement is read-only, uses \`@albion/albion-client\`, targets Europe
  only, and never imports Prisma or writes to a database.
`;
}

function paginationTable(run: MeasurementRun): string {
  const rows = run.offsets.map((offset) => {
    const observations = run.requests.filter(
      (request) => request.ok && request.offset === offset,
    );
    const latest = observations.at(-1);
    const counts = observations.map((request) => request.eventCount ?? 0);
    const range = counts.length
      ? `${Math.min(...counts)}-${Math.max(...counts)}`
      : "not measured";

    return `| ${offset} | ${observations.length} | ${range} | ${latest?.eventIds[0] ?? "-"} | ${latest?.eventIds.at(-1) ?? "-"} | ${latest?.descendingByTime === undefined ? "-" : String(latest.descendingByTime)} |`;
  });

  return `| Offset | Successful observations | Event-count range | Latest first ID | Latest last ID | Newest-first timestamps |
| ---: | ---: | --- | ---: | ---: | --- |
${rows.join("\n")}`;
}

function overlapTable(run: MeasurementRun): string {
  const rows: string[] = [];

  for (let index = 0; index < run.offsets.length - 1; index += 1) {
    const leftOffset = run.offsets[index];
    const rightOffset = run.offsets[index + 1];
    const left = run.requests
      .filter((request) => request.ok && request.offset === leftOffset)
      .at(-1);
    const right = run.requests
      .filter((request) => request.ok && request.offset === rightOffset)
      .at(-1);
    const overlap =
      left && right
        ? left.eventIds.filter((id) => right.eventIds.includes(id)).length
        : null;
    rows.push(
      `| ${leftOffset} -> ${rightOffset} | ${overlap ?? "not measured"} |`,
    );
  }

  return `| Latest page pair | Shared event IDs |
| --- | ---: |
${rows.join("\n")}

Because the global feed changes between minute-spaced requests, overlap is an
observed operational value, not a claim that the API provides a stable snapshot.`;
}

function recommendation(
  isFinal: boolean,
  errorRate: number,
  rateLimitCount: number,
): string {
  const confidence = isFinal ? "Final" : "Preliminary";

  if (rateLimitCount > 0 || errorRate > 1) {
    return `${confidence} recommendation: poll no faster than every two minutes.
Retry network errors, HTTP 429, and HTTP 5xx with exponential backoff and jitter
(30s, 60s, then 120s), honoring \`Retry-After\` when present. Do not retry other
HTTP 4xx responses automatically.`;
  }

  return `${confidence} recommendation: one request per minute is the working
polling interval. Retry network errors, HTTP 429, and HTTP 5xx with exponential
backoff and jitter (30s, 60s, then 120s), honoring \`Retry-After\` when present.
Do not retry other HTTP 4xx responses automatically.${
    isFinal
      ? ""
      : " Keep this recommendation provisional until the 24-hour run completes."
  }`;
}

function pickDiagnosticHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};

  for (const name of [
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ]) {
    const value = headers.get(name);
    if (value !== null) {
      picked[name] = value;
    }
  }

  return picked;
}

function isDescending(timestamps: string[]): boolean {
  return timestamps.every(
    (timestamp, index) =>
      index === 0 ||
      Date.parse(timestamps[index - 1] ?? "") >= Date.parse(timestamp),
  );
}

function countBy<T>(
  values: T[],
  keyFor: (value: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyFor(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function markdownCountTable(counts: Map<string, number>, heading: string): string {
  if (counts.size === 0) {
    return "No requests measured yet.";
  }

  const rows = [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `| ${key} | ${count} |`)
    .join("\n");
  return `| ${heading} | Count |
| --- | ---: |
${rows}`;
}

function formatInterval(intervalMs: number): string {
  return intervalMs % 1_000 === 0
    ? `${intervalMs / 1_000} seconds`
    : `${intervalMs} ms`;
}

function readIntegerEnv(
  name: string,
  fallback: number,
  options: { minimum: number },
): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < options.minimum) {
    throw new TypeError(`${name} must be an integer >= ${options.minimum}.`);
  }
  return value;
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
