/** Albion server clusters supported by the public Gameinfo API. */
export type AlbionRegion = "west" | "europe" | "east";

export interface AlbionFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Pick<Headers, "get">;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type AlbionFetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<AlbionFetchResponse>;

export interface AlbionClientOptions {
  /** The Albion server whose data this client will request. */
  region: AlbionRegion;
  /** Override only for tests or a trusted API proxy. */
  baseUrl?: string;
  /** Defaults to the runtime's global fetch. */
  fetch?: AlbionFetch;
  /** Uses the default timeout and retry delays when omitted. */
  retry?: AlbionRetryOptions;
}

export interface AlbionRetryOptions {
  /** Maximum duration of one request in milliseconds. */
  timeoutMs?: number;
  /** Delay before each retry; an empty list disables retries. */
  delaysMs?: readonly number[];
}

export interface AlbionSearchEntity {
  id: string;
  name: string;
}

export interface AlbionSearchPlayer extends AlbionSearchEntity {
  guildName?: string;
}

export interface AlbionSearchResult {
  players: AlbionSearchPlayer[];
  guilds: AlbionSearchEntity[];
  alliances: AlbionSearchEntity[];
}

export interface AlbionPlayerProfile extends AlbionSearchPlayer {
  guildId?: string;
  allianceId?: string;
  allianceName?: string;
  killFame?: number;
  deathFame?: number;
  fameRatio?: number;
}

export interface AlbionGuild extends AlbionSearchEntity {
  founderId?: string;
  founderName?: string;
  founded?: string;
  allianceId?: string;
  allianceName?: string;
  allianceTag?: string;
  memberCount?: number;
  killFame?: number;
  deathFame?: number;
}

export interface AlbionAlliance extends AlbionSearchEntity {
  tag?: string;
  founderId?: string;
  founderName?: string;
  founded?: string;
  guilds: AlbionSearchEntity[];
  playerCount?: number;
}

export interface AlbionEventPlayer extends AlbionSearchPlayer {
  guildId?: string;
  allianceId?: string;
  allianceName?: string;
  allianceTag?: string;
  killFame?: number;
  deathFame?: number;
  fameRatio?: number;
  averageItemPower?: number;
  damageDone?: number;
  supportHealingDone?: number;
  avatar?: string;
  avatarRing?: string;
  lifetimeStatistics?: Record<string, unknown>;
  equipment?: AlbionEquipment;
}

export interface AlbionItem {
  type: string;
  count?: number;
  quality?: number;
  activeSpells?: unknown[];
  passiveSpells?: unknown[];
  legendarySoul?: unknown | null;
}

export interface AlbionEquipment {
  mainHand?: AlbionItem | null;
  offHand?: AlbionItem | null;
  head?: AlbionItem | null;
  armor?: AlbionItem | null;
  shoes?: AlbionItem | null;
  bag?: AlbionItem | null;
  cape?: AlbionItem | null;
  mount?: AlbionItem | null;
  potion?: AlbionItem | null;
  food?: AlbionItem | null;
}

export interface AlbionKillboardEvent {
  id: number;
  occurredAt: string;
  version?: number;
  battleId?: number;
  location: string | null;
  killArea?: string;
  type?: string;
  category?: string;
  totalVictimKillFame?: number;
  participantCount?: number;
  groupMemberCount?: number;
  killer: AlbionEventPlayer;
  victim: AlbionEventPlayer;
  participants: AlbionEventPlayer[];
  groupMembers?: AlbionEventPlayer[];
}

export interface AlbionParseFailure {
  index: number;
  eventId?: number;
  reason: string;
}

export interface AlbionBatchResult<T> {
  records: T[];
  failures: AlbionParseFailure[];
}

export interface AlbionPagination {
  limit?: number;
  offset?: number;
}

export interface AlbionClient {
  gameinfo: {
    /** Search players, guilds, and alliances by name. */
    searchPlayers(query: string): Promise<AlbionSearchResult>;
    /** Get the most recent kill events, newest first. */
    getRecentEvents(pagination?: AlbionPagination): Promise<AlbionKillboardEvent[]>;
    /** Get recent events while retaining valid records if individual records are malformed. */
    getRecentEventsTolerant(
      pagination?: AlbionPagination,
    ): Promise<AlbionBatchResult<AlbionKillboardEvent>>;
    /** Get one kill event by its numeric event id. */
    getEvent(eventId: number): Promise<AlbionKillboardEvent>;
    /** Get a player's profile. */
    getPlayer(playerId: string): Promise<AlbionPlayerProfile>;
    /** Get a guild's profile. */
    getGuild(guildId: string): Promise<AlbionGuild>;
    /** Get the members reported by the guild endpoint. */
    getGuildMembers(guildId: string): Promise<AlbionPlayerProfile[]>;
    /** Get an alliance and its guilds. */
    getAlliance(allianceId: string): Promise<AlbionAlliance>;
    /** Get recent kill events where the player was the killer. */
    getPlayerKills(playerId: string): Promise<AlbionKillboardEvent[]>;
    /** Get recent kill events where the player was the victim. */
    getPlayerDeaths(playerId: string): Promise<AlbionKillboardEvent[]>;
  };
  items: {
    /** Fetch an item's icon bytes from Albion's render service. */
    getIcon(itemType: string): Promise<ArrayBuffer>;
  };
}
