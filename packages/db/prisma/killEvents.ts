import rawEvents from "./data/kill-events.json";
import type { LoadoutItem, PlayerLoadout } from "../src/loadout";
import { players as seededPlayers } from "./players";

const SLOT_FIELDS = {
  MainHand: "main_hand",
  OffHand: "off_hand",
  Head: "head",
  Armor: "body",
  Shoes: "shoe",
  Bag: "bag",
  Cape: "cape",
  Mount: "mount",
  Potion: "potion",
  Food: "food",
} as const satisfies Record<string, keyof PlayerLoadout>;

export interface EventParticipantSeed {
  playerId: string;
  damageDone?: number;
  healingDone?: number;
  killFame?: bigint;
  isPrimary?: boolean;
  itemPower?: number;
  loadout?: PlayerLoadout;
}

export interface KillEventSeed {
  id: string;
  killerId: string;
  victimId: string;
  location: string | null;
  occurredAt: Date;
  battleId: string | null;
  totalFame: bigint;
  killerItemPower?: number;
  victimItemPower?: number;
  killerLoadout: PlayerLoadout;
  victimLoadout: PlayerLoadout;
  participants: EventParticipantSeed[];
  raw: Record<string, unknown>;
}

export interface EventPlayerSeed {
  id: string;
  name: string;
  region: string;
  fame: bigint;
  killFame: bigint;
  deathFame: bigint;
  rating: number;
  stars: number;
}

const apiEvents = rawEvents as Array<Record<string, unknown>>;
const seededIds = new Set(seededPlayers.map((player) => player.id));

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }

  return 0n;
}

function asInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const rounded = Math.round(value);

  if (rounded > 2_147_483_647 || rounded < -2_147_483_648) {
    return undefined;
  }

  return rounded;
}

function asFloat(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function toItem(value: unknown): LoadoutItem | null {
  const item = asRecord(value);

  if (!item || typeof item.Type !== "string" || item.Type.length === 0) {
    return null;
  }

  const loadoutItem: LoadoutItem = { id: item.Type };
  const quality = asInt(item.Quality);
  const count = asInt(item.Count);

  if (quality !== undefined) {
    loadoutItem.quality = quality;
  }

  if (count !== undefined) {
    loadoutItem.count = count;
  }

  return loadoutItem;
}

function toLoadout(equipment: unknown): PlayerLoadout {
  const source = asRecord(equipment) ?? {};
  const loadout: PlayerLoadout = {};

  for (const [apiSlot, slot] of Object.entries(SLOT_FIELDS)) {
    loadout[slot] = toItem(source[apiSlot]);
  }

  return loadout;
}

function readFighter(value: unknown): EventPlayerSeed | null {
  const fighter = asRecord(value);

  if (!fighter || typeof fighter.Id !== "string" || fighter.Id.length === 0) {
    return null;
  }

  return {
    id: fighter.Id,
    name: typeof fighter.Name === "string" && fighter.Name.length > 0 ? fighter.Name : fighter.Id,
    region: "EU",
    fame: 0n,
    killFame: asBigInt(fighter.KillFame),
    deathFame: asBigInt(fighter.DeathFame),
    rating: 0,
    stars: 0,
  };
}

const extraPlayers = new Map<string, EventPlayerSeed>();

function rememberPlayer(value: unknown) {
  const fighter = readFighter(value);

  if (!fighter || seededIds.has(fighter.id) || extraPlayers.has(fighter.id)) {
    return;
  }

  extraPlayers.set(fighter.id, fighter);
}

export const events: KillEventSeed[] = apiEvents.map((event) => {
  const killer = readFighter(event.Killer);
  const victim = readFighter(event.Victim);

  if (!killer || !victim || typeof event.EventId !== "number" || typeof event.TimeStamp !== "string") {
    throw new Error("Kill event seed is missing EventId, TimeStamp, Killer, or Victim.");
  }

  rememberPlayer(event.Killer);
  rememberPlayer(event.Victim);

  const participants: EventParticipantSeed[] = [];
  const seenParticipants = new Set<string>();

  for (const entry of Array.isArray(event.Participants) ? event.Participants : []) {
    const fighter = readFighter(entry);
    const person = asRecord(entry);

    if (!fighter || !person || seenParticipants.has(fighter.id)) {
      continue;
    }

    seenParticipants.add(fighter.id);
    rememberPlayer(entry);

    participants.push({
      playerId: fighter.id,
      damageDone: asInt(person.DamageDone),
      healingDone: asInt(person.SupportHealingDone),
      killFame: asBigInt(person.KillFame),
      isPrimary: fighter.id === killer.id,
      itemPower: asFloat(person.AverageItemPower),
      loadout: toLoadout(person.Equipment),
    });
  }

  const battleId = event.BattleId;

  return {
    id: String(event.EventId),
    killerId: killer.id,
    victimId: victim.id,
    location: typeof event.Location === "string" ? event.Location : null,
    occurredAt: new Date(event.TimeStamp),
    battleId: typeof battleId === "number" || typeof battleId === "string" ? String(battleId) : null,
    totalFame: asBigInt(event.TotalVictimKillFame),
    killerItemPower: asFloat(asRecord(event.Killer)?.AverageItemPower),
    victimItemPower: asFloat(asRecord(event.Victim)?.AverageItemPower),
    killerLoadout: toLoadout(asRecord(event.Killer)?.Equipment),
    victimLoadout: toLoadout(asRecord(event.Victim)?.Equipment),
    participants,
    raw: event,
  };
});

export const eventPlayers = [...extraPlayers.values()];
