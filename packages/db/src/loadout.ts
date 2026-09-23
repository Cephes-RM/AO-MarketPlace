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
