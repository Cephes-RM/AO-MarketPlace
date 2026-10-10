/** One equipped item, reduced to the fields ingestion needs to keep. */
export interface LoadoutItem {
  id: string;
  quality?: number;
  count?: number;
}

/**
 * Gear worn by one player in a fight.
 * Slot names match the stored seed shape, not the Albion API's camelCase.
 */
export interface PlayerLoadout {
  main_hand?: LoadoutItem | null;
  off_hand?: LoadoutItem | null;
  head?: LoadoutItem | null;
  body?: LoadoutItem | null;
  shoe?: LoadoutItem | null;
  bag?: LoadoutItem | null;
  cape?: LoadoutItem | null;
  mount?: LoadoutItem | null;
  potion?: LoadoutItem | null;
  food?: LoadoutItem | null;
}

const LOADOUT_SLOTS = {
  main_hand: "MainHand",
  off_hand: "OffHand",
  head: "Head",
  body: "Armor",
  shoe: "Shoes",
  bag: "Bag",
  cape: "Cape",
  mount: "Mount",
  potion: "Potion",
  food: "Food",
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Normalize stored gear JSON, ignoring unknown slots and malformed items. */
export function parseLoadout(value: unknown): PlayerLoadout {
  const source = asRecord(value);
  const loadout: PlayerLoadout = {};
  if (!source) return loadout;

  for (const [slot, apiSlot] of Object.entries(LOADOUT_SLOTS)) {
    const item = asRecord(source[slot] ?? source[apiSlot]);
    const id = item?.id ?? item?.Type;
    if (!item || typeof id !== "string" || !id.trim()) continue;

    const parsed: LoadoutItem = { id: id.trim() };
    const quality = item.quality ?? item.Quality;
    const count = item.count ?? item.Count;
    if (typeof quality === "number" && Number.isInteger(quality) && quality >= 1 && quality <= 5) {
      parsed.quality = quality;
    }
    if (typeof count === "number" && Number.isSafeInteger(count) && count > 0) {
      parsed.count = count;
    }
    loadout[slot as keyof PlayerLoadout] = parsed;
  }
  return loadout;
}
