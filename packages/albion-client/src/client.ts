import { toAlbionApiError } from "./errors.ts";
import {
  parseAlliance,
  parseGuild,
  parseGuildMembers,
  parseKillboardEvent,
  parseKillboardEvents,
  parseKillboardEventsTolerant,
  parsePlayerProfile,
  parseSearchResult,
} from "./parsers.ts";
import type {
  AlbionClient,
  AlbionBatchResult,
  AlbionClientOptions,
  AlbionFetch,
  AlbionFetchResponse,
  AlbionKillboardEvent,
  AlbionPagination,
  AlbionPlayerProfile,
  AlbionRegion,
  AlbionRetryOptions,
  AlbionSearchResult,
} from "./types.ts";

const GAMEINFO_BASE_URLS: Record<AlbionRegion, string> = {
  west: "https://gameinfo.albiononline.com/api/gameinfo/",
  europe: "https://gameinfo-ams.albiononline.com/api/gameinfo/",
  east: "https://gameinfo-sgp.albiononline.com/api/gameinfo/",
};

const ITEM_RENDER_BASE_URL = "https://render.albiononline.com/v1/item/";
const DEFAULT_RETRY_OPTIONS = {
  timeoutMs: 10_000,
  delaysMs: [30_000, 60_000, 120_000],
} as const;

/** Returns true only for an Albion server cluster supported by this package. */
export function isAlbionRegion(value: unknown): value is AlbionRegion {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GAMEINFO_BASE_URLS, value)
  );
}

/** Creates a typed client for the public Albion Online APIs. */
export function createAlbionClient(options: AlbionClientOptions): AlbionClient {
  if (!isAlbionRegion(options.region)) {
    throw new TypeError("An Albion region of west, europe, or east is required.");
  }

  const baseUrl = normaliseBaseUrl(
    options.baseUrl ?? GAMEINFO_BASE_URLS[options.region],
  );
  const request = resolveFetch(options.fetch);
  const retry = resolveRetryOptions(options.retry);

  return {
    gameinfo: {
      async searchPlayers(query: string): Promise<AlbionSearchResult> {
        const term = query.trim();

        if (!term) {
          throw new TypeError("A player search query cannot be empty.");
        }

        return parseSearchResult(
          await getJson(`search?q=${encodeURIComponent(term)}`),
        );
      },

      async getRecentEvents(
        pagination?: AlbionPagination,
      ): Promise<AlbionKillboardEvent[]> {
        return parseKillboardEvents(
          await getJson(withPagination("events", pagination, { maxLimit: 51 })),
        );
      },

      async getRecentEventsTolerant(
        pagination?: AlbionPagination,
      ): Promise<AlbionBatchResult<AlbionKillboardEvent>> {
        return parseKillboardEventsTolerant(
          await getJson(withPagination("events", pagination, { maxLimit: 51 })),
        );
      },

      async getEvent(eventId: number): Promise<AlbionKillboardEvent> {
        assertPositiveInteger(eventId, "eventId");
        return parseKillboardEvent(await getJson(`events/${eventId}`));
      },

      async getPlayer(playerId: string): Promise<AlbionPlayerProfile> {
        return parsePlayerProfile(
          await getJson(`players/${encodeId(playerId, "player")}`),
        );
      },

      async getGuild(guildId: string) {
        return parseGuild(await getJson(`guilds/${encodeId(guildId, "guild")}`));
      },

      async getGuildMembers(guildId: string) {
        return parseGuildMembers(
          await getJson(`guilds/${encodeId(guildId, "guild")}/members`),
        );
      },

      async getAlliance(allianceId: string) {
        return parseAlliance(
          await getJson(`alliances/${encodeId(allianceId, "alliance")}`),
        );
      },

      async getPlayerKills(playerId: string): Promise<AlbionKillboardEvent[]> {
        return parseKillboardEvents(
          await getJson(`players/${encodeId(playerId, "player")}/kills`),
        );
      },

      async getPlayerDeaths(playerId: string): Promise<AlbionKillboardEvent[]> {
        return parseKillboardEvents(
          await getJson(`players/${encodeId(playerId, "player")}/deaths`),
        );
      },
    },

    items: {
      async getIcon(itemType: string): Promise<ArrayBuffer> {
        const normalizedType = itemType.trim();

        if (!normalizedType) {
          throw new TypeError("An item type cannot be empty.");
        }

        const url = `${ITEM_RENDER_BASE_URL}${encodeURIComponent(normalizedType)}`;
        return requestWithRetry(
          url,
          { headers: { accept: "image/*" } },
          (response) => response.arrayBuffer(),
          "Albion item render API",
        );
      },
    },
  };

  async function getJson(path: string): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    return requestWithRetry(
      url,
      { headers: { accept: "application/json" } },
      (response) => response.json(),
    );
  }

  async function requestWithRetry<T>(
    url: string,
    init: { headers: Record<string, string> },
    read: (response: AlbionFetchResponse) => Promise<T>,
    service = "Albion Gameinfo API",
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await requestWithTimeout(url, init, async (response) =>
          response.ok
            ? { response, value: await read(response) }
            : { response },
        );

        if ("value" in result) {
          return result.value as T;
        }

        if (
          !isRetryableStatus(result.response.status) ||
          attempt === retry.delaysMs.length
        ) {
          throw toAlbionApiError(result.response, url, service);
        }

        await wait(retryDelay(attempt, retry.delaysMs, result.response));
      } catch (error) {
        if (
          !isRetryableError(error) ||
          attempt === retry.delaysMs.length
        ) {
          throw error;
        }

        await wait(retryDelay(attempt, retry.delaysMs));
      }
    }
  }

  async function requestWithTimeout<T>(
    url: string,
    init: { headers: Record<string, string> },
    read: (response: AlbionFetchResponse) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = Object.assign(
      new Error("Albion API request timed out."),
      { name: "TimeoutError" },
    );

    try {
      return await Promise.race([
        request(url, { ...init, signal: controller.signal }).then(read),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(timeoutError);
          }, retry.timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}

function resolveFetch(injectedFetch?: AlbionFetch): AlbionFetch {
  if (injectedFetch) {
    return injectedFetch;
  }

  const runtime = globalThis as typeof globalThis & {
    fetch?: AlbionFetch;
  };

  const runtimeFetch = runtime.fetch;

  if (!runtimeFetch) {
    throw new Error(
      "No global fetch implementation is available. Provide fetch in the client options.",
    );
  }

  return (url, init) => runtimeFetch(url, init);
}

function resolveRetryOptions(options?: AlbionRetryOptions): {
  timeoutMs: number;
  delaysMs: readonly number[];
} {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_RETRY_OPTIONS.timeoutMs;
  const delaysMs = options?.delaysMs ?? DEFAULT_RETRY_OPTIONS.delaysMs;

  assertPositiveInteger(timeoutMs, "retry.timeoutMs");
  delaysMs.forEach((delayMs, index) =>
    assertNonNegativeInteger(delayMs, `retry.delaysMs[${index}]`),
  );

  return { timeoutMs, delaysMs };
}

function normaliseBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function encodeId(value: string, kind: string): string {
  const id = value.trim();

  if (!id) {
    throw new TypeError(
      `${kind === "alliance" ? "An" : "A"} ${kind} ID cannot be empty.`,
    );
  }

  return encodeURIComponent(id);
}

function withPagination(
  path: string,
  pagination: AlbionPagination = {},
  options: { maxLimit?: number } = {},
): string {
  const parameters: string[] = [];

  if (pagination.limit !== undefined) {
    assertNonNegativeInteger(pagination.limit, "limit");

    if (options.maxLimit !== undefined && pagination.limit > options.maxLimit) {
      throw new TypeError(`limit must be at most ${options.maxLimit}.`);
    }

    parameters.push(`limit=${pagination.limit}`);
  }

  if (pagination.offset !== undefined) {
    assertNonNegativeInteger(pagination.offset, "offset");
    parameters.push(`offset=${pagination.offset}`);
  }

  const query = parameters.join("&");
  return query ? `${path}?${query}` : path;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function isRetryableError(error: unknown): boolean {
  return isTimeout(error) || error instanceof TypeError;
}

function retryDelay(
  attempt: number,
  delaysMs: readonly number[],
  response?: AlbionFetchResponse,
): number {
  const retryAfter = response?.headers?.get("retry-after");
  const retryAfterMs = retryAfterDelay(retryAfter);

  return retryAfterMs === undefined
    ? Math.floor(Math.random() * delaysMs[attempt])
    : Math.min(retryAfterMs, Math.max(...delaysMs));
}

function retryAfterDelay(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - Date.now());
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
