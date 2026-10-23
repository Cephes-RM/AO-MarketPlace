import type {
  AlbionEquipment,
  AlbionEventPlayer,
  AlbionKillboardEvent,
} from "@albion/albion-client";
import type {
  IngestAlliance,
  IngestBatch,
  IngestGuild,
  IngestKillEvent,
  IngestParticipant,
  IngestPlayer,
} from "@albion/db";
import { parseLoadout, type PlayerLoadout } from "@albion/db/loadout";

const LOADOUT_SLOTS = {
  main_hand: "mainHand",
  off_hand: "offHand",
  head: "head",
  body: "armor",
  shoe: "shoes",
  bag: "bag",
  cape: "cape",
  mount: "mount",
  potion: "potion",
  food: "food",
} as const satisfies Record<keyof PlayerLoadout, keyof AlbionEquipment>;

const INT32_MAX = 2_147_483_647;

export interface MappedEvents {
  batch: IngestBatch;
  skipped: { eventId: number; reason: string }[];
}

/** Maps client equipment into the stored loadout; parseLoadout drops empty slots and invalid values. */
export function toPlayerLoadout(equipment: AlbionEquipment | undefined): PlayerLoadout {
  const slots: Record<string, unknown> = {};
  for (const [slot, apiSlot] of Object.entries(LOADOUT_SLOTS)) {
    const item = equipment?.[apiSlot];
    if (item) slots[slot] = { id: item.type, quality: item.quality, count: item.count };
  }
  return parseLoadout(slots);
}

function isEmpty(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value).length === 0;
}

/**
 * Drops null, empty-string, empty-array and empty-object values at any depth,
 * including the null padding Albion sends for empty inventory slots.
 * Everything else stays as Albion sent it.
 */
export function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripEmpty).filter((entry) => !isEmpty(entry));
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const stripped = stripEmpty(entry);
    if (!isEmpty(stripped)) result[key] = stripped;
  }
  return result;
}

function toInt(value: number | undefined) {
  if (value === undefined) return null;
  const rounded = Math.round(value);
  return Math.abs(rounded) <= INT32_MAX ? rounded : null;
}

function toBigInt(value: number | undefined) {
  return value === undefined ? null : BigInt(Math.trunc(value));
}

function toParticipant(player: AlbionEventPlayer, killerId: string): IngestParticipant {
  return {
    playerId: player.id,
    damageDone: toInt(player.damageDone),
    healingDone: toInt(player.supportHealingDone),
    killFame: toBigInt(player.killFame),
    isPrimary: player.id === killerId,
    itemPower: player.averageItemPower ?? null,
    loadout: toPlayerLoadout(player.equipment),
  };
}

/**
 * Turns fetched events into rows. Events are applied oldest first so the most
 * recent fight decides player, guild and alliance names. Event fame never
 * reaches player rows; lifetime fame only comes from the player endpoint.
 */
export function mapKillEvents(events: AlbionKillboardEvent[], region: string): MappedEvents {
  const alliances = new Map<string, IngestAlliance>();
  const guilds = new Map<string, IngestGuild>();
  const players = new Map<string, IngestPlayer>();
  const mapped: IngestKillEvent[] = [];
  const skipped: MappedEvents["skipped"] = [];

  const dated = events.map((event) => ({ event, occurredAt: new Date(event.occurredAt) }));
  dated.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  for (const { event, occurredAt } of dated) {
    if (Number.isNaN(occurredAt.getTime())) {
      skipped.push({ eventId: event.id, reason: "invalid_timestamp" });
      continue;
    }
    if (event.raw === undefined) {
      skipped.push({ eventId: event.id, reason: "missing_raw_payload" });
      continue;
    }

    const fighters = [event.killer, event.victim, ...event.participants];
    for (const fighter of fighters) {
      players.set(fighter.id, { id: fighter.id, name: fighter.name, region });
      if (fighter.allianceId) {
        alliances.set(fighter.allianceId, {
          id: fighter.allianceId,
          name: fighter.allianceName ?? fighter.allianceTag ?? fighter.allianceId,
        });
      }
      if (fighter.guildId) {
        guilds.set(fighter.guildId, {
          id: fighter.guildId,
          name: fighter.guildName ?? fighter.guildId,
          allianceId: fighter.allianceId ?? null,
        });
      }
    }

    const participants = new Map<string, IngestParticipant>();
    for (const participant of event.participants) {
      if (!participants.has(participant.id)) {
        participants.set(participant.id, toParticipant(participant, event.killer.id));
      }
    }

    const fighterGuilds: { playerId: string; guildId: string | null }[] = [];
    const seenFighterIds = new Set<string>();
    for (const fighter of fighters) {
      if (!seenFighterIds.has(fighter.id)) {
        seenFighterIds.add(fighter.id);
        fighterGuilds.push({
          playerId: fighter.id,
          guildId: fighter.guildId || null,
        });
      }
    }

    mapped.push({
      id: String(event.id),
      killerId: event.killer.id,
      victimId: event.victim.id,
      killerGuildId: event.killer.guildId || null,
      victimGuildId: event.victim.guildId || null,
      fighterGuilds,
      raw: stripEmpty(event.raw) as IngestKillEvent["raw"],
      battleId: event.battleId === undefined ? null : String(event.battleId),
      occurredAt,
      location: event.location,
      totalFame: toBigInt(event.totalVictimKillFame) ?? 0n,
      killerItemPower: event.killer.averageItemPower ?? null,
      victimItemPower: event.victim.averageItemPower ?? null,
      killerLoadout: toPlayerLoadout(event.killer.equipment),
      victimLoadout: toPlayerLoadout(event.victim.equipment),
      participants: [...participants.values()],
    });
  }

  return {
    batch: {
      alliances: [...alliances.values()],
      guilds: [...guilds.values()],
      players: [...players.values()],
      events: mapped,
    },
    skipped,
  };
}
