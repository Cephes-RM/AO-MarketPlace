import { toAlbionApiError } from "./errors.ts";
import {
  parseKillboardEvent,
  parseKillboardEvents,
  parsePlayerProfile,
  parseSearchResult,
} from "./parsers.ts";
import type {
  AlbionClient,
  AlbionClientOptions,
  AlbionFetch,
  AlbionKillboardEvent,
  AlbionPagination,
  AlbionPlayerProfile,
  AlbionRegion,
  AlbionSearchResult,
} from "./types.ts";

const GAMEINFO_BASE_URLS: Record<AlbionRegion, string> = {
  west: "https://gameinfo.albiononline.com/api/gameinfo/",
  europe: "https://gameinfo-ams.albiononline.com/api/gameinfo/",
  east: "https://gameinfo-sgp.albiononline.com/api/gameinfo/",
};

const ITEM_RENDER_BASE_URL = "https://render.albiononline.com/v1/item/";

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

      async getEvent(eventId: number): Promise<AlbionKillboardEvent> {
        assertPositiveInteger(eventId, "eventId");
        return parseKillboardEvent(await getJson(`events/${eventId}`));
      },

      async getPlayer(playerId: string): Promise<AlbionPlayerProfile> {
        return parsePlayerProfile(
          await getJson(`players/${encodePlayerId(playerId)}`),
        );
      },

      async getPlayerKills(
        playerId: string,
        pagination?: AlbionPagination,
      ): Promise<AlbionKillboardEvent[]> {
        const path = withPagination(
          `players/${encodePlayerId(playerId)}/kills`,
          pagination,
        );

        return parseKillboardEvents(await getJson(path));
      },

      async getPlayerDeaths(playerId: string): Promise<AlbionKillboardEvent[]> {
        return parseKillboardEvents(
          await getJson(`players/${encodePlayerId(playerId)}/deaths`),
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
        const response = await request(url, {
          headers: { accept: "image/*" },
        });

        if (!response.ok) {
          throw toAlbionApiError(response, url, "Albion item render API");
        }

        return response.arrayBuffer();
      },
    },
  };

  async function getJson(path: string): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const response = await request(url, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw toAlbionApiError(response, url);
    }

    return response.json();
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

function normaliseBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function encodePlayerId(playerId: string): string {
  const id = playerId.trim();

  if (!id) {
    throw new TypeError("A player ID cannot be empty.");
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
