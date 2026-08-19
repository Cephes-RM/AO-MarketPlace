import type {
  AlbionEquipment,
  AlbionEventPlayer,
  AlbionItem,
  AlbionKillboardEvent,
  AlbionPlayerProfile,
  AlbionSearchEntity,
  AlbionSearchPlayer,
  AlbionSearchResult,
} from "./types.ts";

export function parseSearchResult(payload: unknown): AlbionSearchResult {
  const record = requiredRecord(payload, "search response");

  return {
    players: parsePlayers(record.players),
    guilds: parseEntities(record.guilds, "guild"),
    alliances: parseOptionalEntities(record.alliances, "alliance"),
  };
}

export function parsePlayerProfile(payload: unknown): AlbionPlayerProfile {
  const record = requiredRecord(payload, "player profile");
  const entity = parseEntity(record, "player");
  const guildName = optionalString(record.GuildName, "player GuildName");
  const guildId = optionalString(record.GuildId, "player GuildId");
  const allianceId = optionalString(record.AllianceId, "player AllianceId");
  const allianceName = optionalString(record.AllianceName, "player AllianceName");
  const killFame = optionalNumber(record.KillFame, "player KillFame");
  const deathFame = optionalNumber(record.DeathFame, "player DeathFame");
  const fameRatio = optionalNumber(record.FameRatio, "player FameRatio");

  return {
    ...entity,
    ...(guildName === undefined ? {} : { guildName }),
    ...(guildId === undefined ? {} : { guildId }),
    ...(allianceId === undefined ? {} : { allianceId }),
    ...(allianceName === undefined ? {} : { allianceName }),
    ...(killFame === undefined ? {} : { killFame }),
    ...(deathFame === undefined ? {} : { deathFame }),
    ...(fameRatio === undefined ? {} : { fameRatio }),
  };
}

export function parseKillboardEvents(payload: unknown): AlbionKillboardEvent[] {
  return requiredArray(payload, "killboard events").map((entry) =>
    parseKillboardEvent(entry),
  );
}

export function parseKillboardEvent(value: unknown): AlbionKillboardEvent {
  const record = requiredRecord(value, "kill event");
  const version = optionalNumber(record.Version, "kill event Version");
  const category = optionalString(record.Category, "kill event Category");
  const groupMembers = optionalEventPlayers(
    record.GroupMembers,
    "kill event GroupMembers",
  );

  return {
    id: requiredNumber(record.EventId, "kill event EventId"),
    occurredAt: requiredString(record.TimeStamp, "kill event TimeStamp"),
    ...(version === undefined ? {} : { version }),
    battleId: optionalNumber(record.BattleId, "kill event BattleId"),
    location: nullableString(record.Location, "kill event Location"),
    killArea: optionalString(record.KillArea, "kill event KillArea"),
    type: optionalString(record.Type, "kill event Type"),
    ...(category === undefined ? {} : { category }),
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
    participants: requiredArray(
      record.Participants,
      "kill event Participants",
    ).map((participant) => parseEventPlayer(participant)),
    ...(groupMembers === undefined ? {} : { groupMembers }),
  };
}

function parsePlayers(value: unknown): AlbionSearchPlayer[] {
  return requiredArray(value, "players").map((entry) => {
    const entity = parseEntity(entry, "player");
    const record = requiredRecord(entry, "player");
    const guildName = optionalString(record.GuildName, "player GuildName");

    return guildName === undefined ? entity : { ...entity, guildName };
  });
}

function parseEntities(value: unknown, kind: string): AlbionSearchEntity[] {
  return requiredArray(value, `${kind}s`).map((entry) =>
    parseEntity(entry, kind),
  );
}

function parseOptionalEntities(
  value: unknown,
  kind: string,
): AlbionSearchEntity[] {
  if (value === undefined || value === null) {
    return [];
  }

  return parseEntities(value, kind);
}

function parseEntity(value: unknown, kind: string): AlbionSearchEntity {
  const record = requiredRecord(value, kind);

  return {
    id: requiredString(record.Id, `${kind} Id`),
    name: requiredString(record.Name, `${kind} Name`),
  };
}

function parseEventPlayer(value: unknown): AlbionEventPlayer {
  const record = requiredRecord(value, "event player");
  const entity = parseEntity(record, "event player");
  const guildName = optionalString(record.GuildName, "event player GuildName");
  const guildId = optionalString(record.GuildId, "event player GuildId");
  const allianceId = optionalString(
    record.AllianceId,
    "event player AllianceId",
  );
  const allianceName = optionalString(
    record.AllianceName,
    "event player AllianceName",
  );
  const allianceTag = optionalString(
    record.AllianceTag,
    "event player AllianceTag",
  );
  const killFame = optionalNumber(record.KillFame, "event player KillFame");
  const deathFame = optionalNumber(record.DeathFame, "event player DeathFame");
  const fameRatio = optionalNumber(record.FameRatio, "event player FameRatio");
  const averageItemPower = optionalNumber(
    record.AverageItemPower,
    "event player AverageItemPower",
  );
  const damageDone = optionalNumber(
    record.DamageDone,
    "event player DamageDone",
  );
  const supportHealingDone = optionalNumber(
    record.SupportHealingDone,
    "event player SupportHealingDone",
  );
  const avatar = optionalString(record.Avatar, "event player Avatar");
  const avatarRing = optionalString(
    record.AvatarRing,
    "event player AvatarRing",
  );
  const lifetimeStatistics = optionalRecord(
    record.LifetimeStatistics,
    "event player LifetimeStatistics",
  );
  const equipment = optionalEquipment(record.Equipment);

  return {
    ...entity,
    ...(guildName === undefined ? {} : { guildName }),
    ...(guildId === undefined ? {} : { guildId }),
    ...(allianceId === undefined ? {} : { allianceId }),
    ...(allianceName === undefined ? {} : { allianceName }),
    ...(allianceTag === undefined ? {} : { allianceTag }),
    ...(killFame === undefined ? {} : { killFame }),
    ...(deathFame === undefined ? {} : { deathFame }),
    ...(fameRatio === undefined ? {} : { fameRatio }),
    ...(averageItemPower === undefined ? {} : { averageItemPower }),
    ...(damageDone === undefined ? {} : { damageDone }),
    ...(supportHealingDone === undefined ? {} : { supportHealingDone }),
    ...(avatar === undefined ? {} : { avatar }),
    ...(avatarRing === undefined ? {} : { avatarRing }),
    ...(lifetimeStatistics === undefined ? {} : { lifetimeStatistics }),
    ...(equipment === undefined ? {} : { equipment }),
  };
}

function optionalEventPlayers(
  value: unknown,
  description: string,
): AlbionEventPlayer[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requiredArray(value, description).map((member) =>
    parseEventPlayer(member),
  );
}

function optionalEquipment(value: unknown): AlbionEquipment | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = requiredRecord(value, "event player Equipment");

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

function optionalItem(
  value: unknown,
  description: string,
): AlbionItem | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const record = requiredRecord(value, description);

  return {
    type: requiredString(record.Type, `${description} Type`),
    count: optionalNumber(record.Count, `${description} Count`),
    quality: optionalNumber(record.Quality, `${description} Quality`),
    activeSpells: optionalArray(
      record.ActiveSpells,
      `${description} ActiveSpells`,
    ),
    passiveSpells: optionalArray(
      record.PassiveSpells,
      `${description} PassiveSpells`,
    ),
    legendarySoul: record.LegendarySoul ?? null,
  };
}

function requiredRecord(
  value: unknown,
  description: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid Albion ${description}: expected an object.`);
  }

  return value as Record<string, unknown>;
}

function optionalRecord(
  value: unknown,
  description: string,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requiredRecord(value, description);
}

function requiredArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Invalid Albion ${description}: expected an array.`);
  }

  return value;
}

function optionalArray(
  value: unknown,
  description: string,
): unknown[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requiredArray(value, description);
}

function requiredString(value: unknown, description: string): string {
  if (typeof value !== "string" || !value) {
    throw new TypeError(
      `Invalid Albion ${description}: expected a non-empty string.`,
    );
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
