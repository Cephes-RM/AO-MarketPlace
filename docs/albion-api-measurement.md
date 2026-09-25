# Albion Europe GameInfo API measurement

> **Final result.** A completed 1,440-sample run is classified as final.

## Run configuration

| Field | Value |
| --- | --- |
| API | Official Albion Europe GameInfo API |
| Endpoint family | `/api/gameinfo/events` |
| Started | 2026-09-24T14:35:59.700Z |
| Finished | 2026-09-25T16:14:03.528Z |
| Elapsed time | 25.63 hours |
| Requests | 1440 / 1440 |
| Configured interval | 60 seconds |
| Observed average interval | 64.09 seconds |
| Limit | 51 |
| Rotating offsets | 0, 51, 102, 255 |

## Reliability

| Metric | Observed |
| --- | ---: |
| Successful client calls | 1437 |
| Failed client calls | 3 |
| Error rate | 0.21% |
| Requests with 429/rate-limit signs | 0 |

### HTTP status codes

| Status | Count |
| --- | ---: |
| 200 | 1437 |
| network error | 3 |

## Global events pagination

| Offset | Successful observations | Event-count range | Latest first ID | Latest last ID | Newest-first timestamps |
| ---: | ---: | --- | ---: | ---: | --- |
| 0 | 360 | 51-51 | 439339293 | 439339021 | true |
| 51 | 359 | 51-51 | 439337956 | 439337722 | true |
| 102 | 358 | 51-51 | 439334648 | 439334439 | true |
| 255 | 360 | 51-51 | 439330222 | 439329969 | true |

Offsets are rotated across requests, so a normal run measures each offset 360
times without sending bursts. Event IDs are retained in the result JSON so page
overlap and movement can be inspected. Counts and first/last IDs below use the
latest successful observation for each offset.

| Latest page pair | Shared event IDs |
| --- | ---: |
| 0 -> 51 | 0 |
| 51 -> 102 | 0 |
| 102 -> 255 | 0 |

Because the global feed changes between minute-spaced requests, overlap is an
observed operational value, not a claim that the API provides a stable snapshot.

## Polling and retry recommendation

Final recommendation: approximately one request per minute is the working
polling interval. Retry network errors, HTTP 429, and HTTP 5xx with exponential
backoff and jitter (30s, 60s, then 120s), honoring `Retry-After` when present.
Do not retry other HTTP 4xx responses automatically.

## Artifacts and scope

- `fixtures/albion-api/europe/measurement.json` contains per-request
  timing, status, selected response headers, event counts, and event IDs.
- `fixtures/albion-api/europe/events-sample.json` contains up to two raw,
  unmodified event objects captured from a successful API response.
- The measurement is read-only, uses `@albion/albion-client`, targets Europe
  only, and never imports Prisma or writes to a database.
