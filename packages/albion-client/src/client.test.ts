import { describe, expect, it } from "vitest";
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
    const fetch: AlbionFetch = async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => null,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const client = createAlbionClient({ region: "west", fetch });

    await expect(client.gameinfo.getPlayer("player-1")).rejects.toMatchObject({
      name: "AlbionApiError",
      status: 503,
      message: "Albion Gameinfo API request failed with 503. Service Unavailable",
    } satisfies Partial<AlbionApiError>);
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
