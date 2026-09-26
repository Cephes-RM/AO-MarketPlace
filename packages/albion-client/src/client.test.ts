import { describe, expect, it, vi } from "vitest";
import { AlbionApiError, createAlbionClient, isAlbionRegion } from "./index.ts";
import type { AlbionFetch, AlbionFetchResponse } from "./types.ts";

function jsonResponse(payload: unknown): AlbionFetchResponse {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function failedResponse(status: number, retryAfter?: string): AlbionFetchResponse {
  return {
    ok: false,
    status,
    statusText: "Service Unavailable",
    ...(retryAfter === undefined
      ? {}
      : { headers: { get: (name) => (name === "retry-after" ? retryAfter : null) } }),
    json: async () => null,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function eventPayload(id = 42): unknown {
  return {
    EventId: id,
    TimeStamp: "2026-09-18T12:00:00Z",
    Location: null,
    Killer: { Id: "killer-1", Name: "Killer" },
    Victim: { Id: "victim-1", Name: "Victim" },
    Participants: [],
  };
}

describe("isAlbionRegion", () => {
  it("accepts supported regions only", () => {
    expect(isAlbionRegion("west")).toBe(true);
    expect(isAlbionRegion("europe")).toBe(true);
    expect(isAlbionRegion("east")).toBe(true);
    expect(isAlbionRegion("north")).toBe(false);
    expect(isAlbionRegion(undefined)).toBe(false);
  });
});

describe("createAlbionClient", () => {
  it("trims and encodes a player search before requesting and parsing it", async () => {
    const requests: string[] = [];
    const fetch: AlbionFetch = async (url) => {
      requests.push(url);

      return jsonResponse({
        players: [{ Id: "player-1", Name: "Cerber0S", GuildName: "A-T-L-A-S" }],
        guilds: [{ Id: "guild-1", Name: "A-T-L-A-S" }],
        alliances: null,
      });
    };
    const client = createAlbionClient({
      region: "europe",
      baseUrl: "https://example.test/api",
      fetch,
    });

    await expect(client.gameinfo.searchPlayers("  Cerber 0S  ")).resolves.toEqual({
      players: [
        { id: "player-1", name: "Cerber0S", guildName: "A-T-L-A-S" },
      ],
      guilds: [{ id: "guild-1", name: "A-T-L-A-S" }],
      alliances: [],
    });
    expect(requests).toEqual([
      "https://example.test/api/search?q=Cerber%200S",
    ]);
  });

  it("returns an AlbionApiError when the API request fails", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return failedResponse(503);
    };
    const client = createAlbionClient({ region: "west", fetch });

    try {
      await expect(client.gameinfo.getPlayer("player-1")).rejects.toMatchObject({
        name: "AlbionApiError",
        status: 503,
        message: "Albion Gameinfo API request failed with 503. Service Unavailable",
      } satisfies Partial<AlbionApiError>);
      expect(requestCount).toBe(4);
    } finally {
      random.mockRestore();
    }
  });

  it("retries a transient 5xx response before parsing the successful response", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return requestCount === 1
        ? failedResponse(502)
        : jsonResponse({ Id: "player-1", Name: "Cerber0S" });
    };
    const client = createAlbionClient({ region: "west", fetch });

    try {
      await expect(client.gameinfo.getPlayer("player-1")).resolves.toEqual({
        id: "player-1",
        name: "Cerber0S",
      });
      expect(requestCount).toBe(2);
    } finally {
      random.mockRestore();
    }
  });

  it("retries 429 responses and honors Retry-After", async () => {
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return requestCount === 1
        ? failedResponse(429, "0")
        : jsonResponse({ Id: "player-1", Name: "Cerber0S" });
    };
    const client = createAlbionClient({ region: "west", fetch });

    await expect(client.gameinfo.getPlayer("player-1")).resolves.toEqual({
      id: "player-1",
      name: "Cerber0S",
    });
    expect(requestCount).toBe(2);
  });

  it("retries a network error", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      if (requestCount === 1) throw new TypeError("fetch failed");
      return jsonResponse({ Id: "player-1", Name: "Cerber0S" });
    };
    const client = createAlbionClient({ region: "west", fetch });

    try {
      await expect(client.gameinfo.getPlayer("player-1")).resolves.toEqual({
        id: "player-1",
        name: "Cerber0S",
      });
      expect(requestCount).toBe(2);
    } finally {
      random.mockRestore();
    }
  });

  it("retries a timeout from an injected fetch", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      if (requestCount === 1) return new Promise(() => {});
      return jsonResponse({ Id: "player-1", Name: "Cerber0S" });
    };
    const client = createAlbionClient({ region: "west", fetch });

    try {
      vi.useFakeTimers();
      const player = client.gameinfo.getPlayer("player-1");
      await vi.runAllTimersAsync();
      await expect(player).resolves.toEqual({
        id: "player-1",
        name: "Cerber0S",
      });
      expect(requestCount).toBe(2);
    } finally {
      vi.useRealTimers();
      random.mockRestore();
    }
  });

  it("adds valid pagination values to recent-event requests", async () => {
    const requests: string[] = [];
    const fetch: AlbionFetch = async (url) => {
      requests.push(url);
      return jsonResponse([]);
    };
    const client = createAlbionClient({
      region: "east",
      baseUrl: "https://example.test/api/",
      fetch,
    });

    await expect(
      client.gameinfo.getRecentEvents({ limit: 25, offset: 50 }),
    ).resolves.toEqual([]);
    expect(requests).toEqual([
      "https://example.test/api/events?limit=25&offset=50",
    ]);
  });

  it("keeps valid events and reports malformed events through the tolerant method", async () => {
    const fetch: AlbionFetch = async () =>
      jsonResponse([eventPayload(), { EventId: "not-a-number" }]);
    const client = createAlbionClient({ region: "east", fetch });

    await expect(client.gameinfo.getRecentEvents()).rejects.toThrow(
      "Invalid Albion kill event EventId: expected a number.",
    );
    await expect(client.gameinfo.getRecentEventsTolerant()).resolves.toEqual({
      records: [
        {
          id: 42,
          occurredAt: "2026-09-18T12:00:00Z",
          location: null,
          killer: { id: "killer-1", name: "Killer" },
          victim: { id: "victim-1", name: "Victim" },
          participants: [],
        },
      ],
      failures: [
        {
          index: 1,
          reason: "Invalid Albion kill event EventId: expected a number.",
        },
      ],
    });
  });

  it("rejects invalid input before making an API request", async () => {
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return jsonResponse([]);
    };
    const client = createAlbionClient({ region: "west", fetch });

    await expect(client.gameinfo.searchPlayers("   ")).rejects.toThrow(
      "A player search query cannot be empty.",
    );
    await expect(client.gameinfo.getPlayer(" ")).rejects.toThrow(
      "A player ID cannot be empty.",
    );
    await expect(
      client.gameinfo.getRecentEvents({ limit: 52 }),
    ).rejects.toThrow("limit must be at most 51.");
    await expect(
      client.gameinfo.getRecentEvents({ offset: -1 }),
    ).rejects.toThrow("offset must be a non-negative integer.");
    expect(requestCount).toBe(0);
  });
});
