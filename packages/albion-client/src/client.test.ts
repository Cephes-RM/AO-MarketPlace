import { describe, expect, it, vi } from "vitest";
import allianceFixture from "./fixtures/europe-alliance.json";
import guildFixture from "./fixtures/europe-guild.json";
import membersFixture from "./fixtures/europe-guild-members.json";
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
  // Real Europe Gameinfo payloads; members are from the supplied A-T-L-A-S response.
  it("fetches and parses real Europe guild, member, and alliance payloads", async () => {
    const base = "https://gameinfo-ams.albiononline.com/api/gameinfo/";
    const guildId = guildFixture.Id;
    const allianceId = allianceFixture.AllianceId;
    const payloads = new Map<string, unknown>([
      [`${base}guilds/${guildId}`, guildFixture],
      [`${base}guilds/${guildId}/members`, membersFixture],
      [`${base}alliances/${allianceId}`, allianceFixture],
    ]);
    const requests: string[] = [];
    const fetch: AlbionFetch = async (url) => {
      requests.push(url);
      if (!payloads.has(url)) throw new Error(`Unexpected URL: ${url}`);
      return jsonResponse(payloads.get(url));
    };
    const client = createAlbionClient({ region: "europe", fetch });

    const guild = await client.gameinfo.getGuild(guildId);
    expect(guild).toEqual({
      id: guildId,
      name: "A-T-L-A-S",
      founderId: "KgXzr2H7RF2PcYKr1uJGQA",
      founderName: "cephes",
      founded: "2026-03-27T14:30:38.261277Z",
      killFame: 941_588_278,
      deathFame: 789_834_134,
      memberCount: 36,
    });
    const members = await client.gameinfo.getGuildMembers(guildId);
    expect(members).toHaveLength(guildFixture.MemberCount);
    expect(guild.memberCount).toBe(members.length);
    expect(members[0]).toEqual({
      id: "cf25hviRTz6a374hcLwgdw",
      name: "Zikohlk",
      guildId,
      guildName: "A-T-L-A-S",
      killFame: 14_707_274,
      deathFame: 8_318_447,
      fameRatio: 1.77,
    });
    expect(members.every((member) => member.guildId === guildId)).toBe(true);
    await expect(client.gameinfo.getAlliance(allianceId)).resolves.toEqual({
      id: allianceId,
      name: "Bozy Smallec",
      tag: "Whyy",
      founderId: "_3pLOkOLRDWiRLC7g4ospw",
      founderName: "NaczelnyBoomer",
      founded: "2026-04-12T17:58:19.413214Z",
      guilds: [
        { id: "3u7SpJ5KRjCzRDNg5TybFw", name: "FearIess" },
        { id: "7TSjsJztTre-LTGzPbrFOg", name: "N E X U S" },
        { id: "0PwhfF-hRfSkyzz_A4TxfQ", name: "Ruthless Reign" },
        { id: "Wnt8anqNRRSSWA96p8m4IA", name: "WhySpierdalasz" },
      ],
      playerCount: 224,
    });
    expect(requests).toEqual([...payloads.keys()]);
  });

  it("rejects malformed guild, member, and alliance payloads", async () => {
    const fetch: AlbionFetch = async (url) =>
      jsonResponse(url.includes("/members") ? {} : { Id: "only-id" });
    const client = createAlbionClient({ region: "europe", fetch });

    await expect(client.gameinfo.getGuild("guild-id")).rejects.toThrow(
      "Invalid Albion guild Name: expected a non-empty string.",
    );
    await expect(client.gameinfo.getGuildMembers("guild-id")).rejects.toThrow(
      "Invalid Albion guild members: expected an array.",
    );
    await expect(client.gameinfo.getAlliance("alliance-id")).rejects.toThrow(
      "Invalid Albion alliance AllianceId: expected a non-empty string.",
    );
  });

  it("requests player kills and deaths without unsupported pagination", async () => {
    const requests: string[] = [];
    const fetch: AlbionFetch = async (url) => {
      requests.push(url);
      return jsonResponse([]);
    };
    const client = createAlbionClient({ region: "europe", fetch });

    await expect(client.gameinfo.getPlayerKills(" player/id ")).resolves.toEqual([]);
    await expect(client.gameinfo.getPlayerDeaths(" player/id ")).resolves.toEqual([]);
    expect(requests).toEqual([
      "https://gameinfo-ams.albiononline.com/api/gameinfo/players/player%2Fid/kills",
      "https://gameinfo-ams.albiononline.com/api/gameinfo/players/player%2Fid/deaths",
    ]);
  });

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

  it("uses configured retry delays instead of the defaults", async () => {
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return failedResponse(503);
    };
    const client = createAlbionClient({
      region: "west",
      fetch,
      retry: { delaysMs: [] },
    });

    await expect(client.gameinfo.getPlayer("player-1")).rejects.toMatchObject({
      status: 503,
    } satisfies Partial<AlbionApiError>);
    expect(requestCount).toBe(1);
  });

  it("uses the configured request timeout", async () => {
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return new Promise(() => {});
    };
    const client = createAlbionClient({
      region: "west",
      fetch,
      retry: { timeoutMs: 1, delaysMs: [] },
    });

    try {
      vi.useFakeTimers();
      const player = client.gameinfo.getPlayer("player-1");
      const rejected = expect(player).rejects.toMatchObject({
        name: "TimeoutError",
      });
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(requestCount).toBe(1);
    } finally {
      vi.useRealTimers();
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

  it("caps Retry-After at the largest configured delay", async () => {
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return requestCount === 1
        ? failedResponse(429, "3600")
        : jsonResponse({ Id: "player-1", Name: "Cerber0S" });
    };
    const client = createAlbionClient({
      region: "west",
      fetch,
      retry: { delaysMs: [5] },
    });

    try {
      vi.useFakeTimers();
      const player = client.gameinfo.getPlayer("player-1");
      const resolved = expect(player).resolves.toEqual({
        id: "player-1",
        name: "Cerber0S",
      });
      await vi.advanceTimersByTimeAsync(5);
      await resolved;
      expect(requestCount).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps each Retry-After wait at the largest configured delay", async () => {
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return requestCount < 3
        ? failedResponse(429, "3600")
        : jsonResponse({ Id: "player-1", Name: "Cerber0S" });
    };
    const client = createAlbionClient({
      region: "west",
      fetch,
      retry: { delaysMs: [5, 10] },
    });

    try {
      vi.useFakeTimers();
      const player = client.gameinfo.getPlayer("player-1");
      const resolved = expect(player).resolves.toMatchObject({ id: "player-1" });
      await vi.advanceTimersByTimeAsync(9);
      expect(requestCount).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(requestCount).toBe(2);
      await vi.advanceTimersByTimeAsync(9);
      expect(requestCount).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      await resolved;
      expect(requestCount).toBe(3);
    } finally {
      vi.useRealTimers();
    }
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

  it("times out and retries when the response body hangs", async () => {
    let requestCount = 0;
    const fetch: AlbionFetch = async () => {
      requestCount += 1;
      return requestCount === 1
        ? { ...jsonResponse(null), json: async () => new Promise(() => {}) }
        : jsonResponse({ Id: "player-1", Name: "Cerber0S" });
    };
    const client = createAlbionClient({
      region: "west",
      fetch,
      retry: { timeoutMs: 1, delaysMs: [0] },
    });

    try {
      vi.useFakeTimers();
      const player = client.gameinfo.getPlayer("player-1");
      const resolved = expect(player).resolves.toMatchObject({ id: "player-1" });
      await vi.runAllTimersAsync();
      await resolved;
      expect(requestCount).toBe(2);
    } finally {
      vi.useRealTimers();
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
    const malformedEvent = {
      ...(eventPayload(99) as Record<string, unknown>),
      TimeStamp: undefined,
    };
    const fetch: AlbionFetch = async () =>
      jsonResponse([eventPayload(), malformedEvent]);
    const client = createAlbionClient({ region: "east", fetch });

    await expect(client.gameinfo.getRecentEvents()).rejects.toThrow(
      "Invalid Albion kill event TimeStamp: expected a non-empty string.",
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
          eventId: 99,
          reason: "Invalid Albion kill event TimeStamp: expected a non-empty string.",
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
    await expect(client.gameinfo.getGuild(" ")).rejects.toThrow(
      "A guild ID cannot be empty.",
    );
    await expect(client.gameinfo.getGuildMembers(" ")).rejects.toThrow(
      "A guild ID cannot be empty.",
    );
    await expect(client.gameinfo.getAlliance(" ")).rejects.toThrow(
      "An alliance ID cannot be empty.",
    );
    await expect(
      client.gameinfo.getRecentEvents({ limit: 52 }),
    ).rejects.toThrow("limit must be at most 51.");
    await expect(
      client.gameinfo.getRecentEvents({ offset: -1 }),
    ).rejects.toThrow("offset must be a non-negative integer.");
    expect(requestCount).toBe(0);
  });

  it.each(["feed", "detail"] as const)("cancels an active %s request without retrying", async (method) => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      requestSignal = init?.signal;
      return new Promise<AlbionFetchResponse>(() => {});
    });
    const api = createAlbionClient({ region: "europe", fetch }).gameinfo;
    const pending = method === "feed"
      ? api.getRecentEventsTolerant({ limit: 51 }, controller.signal)
      : api.getEvent(42, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not request an event with an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => jsonResponse(eventPayload()));
    const api = createAlbionClient({ region: "europe", fetch }).gameinfo;
    await expect(api.getEvent(42, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels Retry-After backoff and clears its timer", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetch = vi.fn(async () => failedResponse(429, "30"));
      const api = createAlbionClient({ region: "europe", fetch }).gameinfo;
      const pending = api.getEvent(42, controller.signal);
      const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      controller.abort();
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
