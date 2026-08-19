import type {
  AlbionClient,
  AlbionClientOptions,
  AlbionEventPlayer,
  AlbionFetch,
  AlbionFetchResponse,
  AlbionEquipment,
  AlbionItem,
  AlbionKillboardEvent,
  AlbionPagination,
  AlbionPlayerProfile,
  AlbionRegion,
  AlbionSearchEntity,
  AlbionSearchPlayer,
  AlbionSearchResult,
} from "./types.ts";

const GAMEINFO_BASE_URLS: Record<AlbionRegion, string> = {
  west: "https://gameinfo.albiononline.com/api/gameinfo/",
  europe: "https://gameinfo-ams.albiononline.com/api/gameinfo/",
  east: "https://gameinfo-sgp.albiononline.com/api/gameinfo/",
};

const ITEM_RENDER_BASE_URL = "https://render.albiononline.com/v1/item/";

declare const fetch: AlbionFetch;

export class AlbionApiError extends Error {
  public readonly status: number;
  public readonly url: string;

  constructor(
    message: string,
    status: number,
    url: string,
  ) {
    super(message);
    this.name = "AlbionApiError";
    this.status = status;
    this.url = url;
  }
}

/** Returns true only for an Albion server cluster supported by this package. */
export function isAlbionRegion(value: unknown): value is AlbionRegion {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GAMEINFO_BASE_URLS, value)
  );
}

/** Creates a typed client for the public Albion Online Gameinfo API. */
export function createAlbionClient(options: AlbionClientOptions): AlbionClient {
  if (!isAlbionRegion(options.region)) {
    throw new TypeError("An Albion region of west, europe, or east is required.");
  }

  const baseUrl = normaliseBaseUrl(
    options.baseUrl ?? GAMEINFO_BASE_URLS[options.region],
  );
  const request = options.fetch ?? fetch;

  return {
    gameinfo: {
      async searchPlayers(query: string): Promise<AlbionSearchResult> {
        const term = query.trim();

        if (!term) {
          throw new TypeError("A player search query cannot be empty.");
        }

        return parseSearchResult(await getJson(`search?q=${encodeURIComponent(term)}`));
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
        return parsePlayerProfile(await getJson(`players/${encodePlayerId(playerId)}`));
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
          throw toApiError(response, url, "Albion item render API");
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
      throw toApiError(response, url);
    }

    return response.json();
  }
}

function normaliseBaseUrl(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function toApiError(
  response: AlbionFetchResponse,
  url: string,
  service = "Albion Gameinfo API",
): AlbionApiError {
  const detail = response.statusText ? ` ${response.statusText}` : "";
  return new AlbionApiError(
    `${service} request failed with ${response.status}.${detail}`.trim(),
    response.status,
    url,
  );
}

function parseSearchResult(payload: unknown): AlbionSearchResult {
  const record = asRecord(payload, "search response");

  return {
    players: parsePlayers(record.players),
    guilds: parseEntities(record.guilds, "guild"),
    alliances: parseEntities(record.alliances, "alliance"),
  };
}

function parsePlayerProfile(payload: unknown): AlbionPlayerProfile {
  const record = asRecord(payload, "player profile");
  const { lifetimeStatistics: _lifetimeStatistics, ...profile } =
    parseEventPlayer(record);

  return profile;
}

function parseKillboardEvents(payload: unknown): AlbionKillboardEvent[] {
  return asArray(payload, "killboard events").map((entry) =>
    parseKillboardEvent(entry),
  );
}

function parseKillboardEvent(value: unknown): AlbionKillboardEvent {
  const record = asRecord(value, "kill event");
  const version = optionalNumber(record.Version, "kill event Version");
  const category = optionalString(record.Category, "kill event Category");
  const groupMembers =
    record.GroupMembers === undefined
      ? undefined
      : asArray(record.GroupMembers, "kill event GroupMembers").map((member) =>
          parseEventPlayer(member),
        );

  return {
    id: requiredNumber(record.EventId, "kill event EventId"),
    occurredAt: requiredString(record.TimeStamp, "kill event TimeStamp"),
    ...(version === undefined ? {} : { version }),
    battleId: optionalNumber(record.BattleId, "kill event BattleId"),
    location: nullableString(record.Location, "kill event Location"),
    killArea: optionalString(record.KillArea, "kill event KillArea"),
    type: optionalString(record.Type, "kill event Type"),
    category,
    totalVictimKillFame: optionalNumber(
      record.TotalVictimKillFame,
      "kill event TotalVictimKillFame",
    ),
    participantCount: optionalNumber(
      record.numberOfParticipants,
      "kill event numberOfParticipants",
    ),
    groupMemberCount: optionalNumber(
      record.groupMemberCount,
      "kill event groupMemberCount",
    ),
    killer: parseEventPlayer(record.Killer),
    victim: parseEventPlayer(record.Victim),
    participants: asArray(record.Participants, "kill event Participants").map(
      (participant) => parseEventPlayer(participant),
    ),
    ...(groupMembers === undefined ? {} : { groupMembers }),
  };
}

function parsePlayers(value: unknown): AlbionSearchPlayer[] {
  return asArray(value, "players").map((entry) => {
    const entity = parseEntity(entry, "player");
    const record = asRecord(entry, "player");
    const guildName = optionalString(record.GuildName, "player GuildName");

    return guildName === undefined ? entity : { ...entity, guildName };
  });
}

function parseEntities(value: unknown, kind: string): AlbionSearchEntity[] {
  return asArray(value, `${kind}s`).map((entry) => parseEntity(entry, kind));
}

function parseEntity(value: unknown, kind: string): AlbionSearchEntity {
  const record = asRecord(value, kind);

  return {
    id: requiredString(record.Id, `${kind} Id`),
    name: requiredString(record.Name, `${kind} Name`),
  };
}

function parseEventPlayer(value: unknown): AlbionEventPlayer {
  const record = asRecord(value, "event player");
  const entity = parseEntity(record, "event player");
  const guildName = optionalString(record.GuildName, "event player GuildName");
  const equipment = optionalEquipment(record.Equipment);
  const lifetimeStatistics = optionalRecord(
    record.LifetimeStatistics,
    "event player LifetimeStatistics",
  );

  return {
    ...withOptionalFields(entity, {
      guildName,
      guildId: optionalString(record.GuildId, "event player GuildId"),
      allianceId: optionalString(record.AllianceId, "event player AllianceId"),
      allianceName: optionalString(record.AllianceName, "event player AllianceName"),
      allianceTag: optionalString(record.AllianceTag, "event player AllianceTag"),
      killFame: optionalNumber(record.KillFame, "event player KillFame"),
      deathFame: optionalNumber(record.DeathFame, "event player DeathFame"),
      fameRatio: optionalNumber(record.FameRatio, "event player FameRatio"),
      averageItemPower: optionalNumber(
        record.AverageItemPower,
        "event player AverageItemPower",
      ),
      damageDone: optionalNumber(record.DamageDone, "event player DamageDone"),
      supportHealingDone: optionalNumber(
        record.SupportHealingDone,
        "event player SupportHealingDone",
      ),
      avatar: optionalString(record.Avatar, "event player Avatar"),
      avatarRing: optionalString(record.AvatarRing, "event player AvatarRing"),
    }),
    ...(lifetimeStatistics === undefined ? {} : { lifetimeStatistics }),
    ...(equipment === undefined ? {} : { equipment }),
  };
}

function optionalEquipment(value: unknown): AlbionEquipment | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = asRecord(value, "event player Equipment");

  return {
    mainHand: optionalItem(record.MainHand, "equipment MainHand"),
    offHand: optionalItem(record.OffHand, "equipment OffHand"),
    head: optionalItem(record.Head, "equipment Head"),
    armor: optionalItem(record.Armor, "equipment Armor"),
    shoes: optionalItem(record.Shoes, "equipment Shoes"),
    bag: optionalItem(record.Bag, "equipment Bag"),
    cape: optionalItem(record.Cape, "equipment Cape"),
    mount: optionalItem(record.Mount, "equipment Mount"),
    potion: optionalItem(record.Potion, "equipment Potion"),
    food: optionalItem(record.Food, "equipment Food"),
  };
}

function optionalItem(value: unknown, description: string): AlbionItem | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const record = asRecord(value, description);

  return {
    type: requiredString(record.Type, `${description} Type`),
    count: optionalNumber(record.Count, `${description} Count`),
    quality: optionalNumber(record.Quality, `${description} Quality`),
    activeSpells: optionalArray(record.ActiveSpells, `${description} ActiveSpells`),
    passiveSpells: optionalArray(record.PassiveSpells, `${description} PassiveSpells`),
    legendarySoul: record.LegendarySoul ?? null,
  };
}

function asRecord(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid Albion ${description}: expected an object.`);
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown, description: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`Invalid Albion ${description}: expected an array.`);
  }

  return value;
}

function optionalArray(value: unknown, description: string): unknown[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return asArray(value, description);
}

function requiredString(value: unknown, description: string): string {
  if (typeof value !== "string" || !value) {
    throw new TypeError(`Invalid Albion ${description}: expected a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown, description: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TypeError(`Invalid Albion ${description}: expected a string.`);
  }

  return value;
}

function nullableString(value: unknown, description: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredString(value, description);
}

function requiredNumber(value: unknown, description: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Invalid Albion ${description}: expected a number.`);
  }

  return value;
}

function optionalNumber(value: unknown, description: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requiredNumber(value, description);
}

function optionalRecord(
  value: unknown,
  description: string,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return asRecord(value, description);
}

function withOptionalFields<T extends object>(
  required: T,
  optional: Record<string, string | number | undefined>,
): T {
  return Object.fromEntries(
    Object.entries({ ...required, ...optional }).filter(([, value]) => value !== undefined),
  ) as T;
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
