/** Fame values come from BigInt columns, so they may arrive as strings. */
export type FameValue = string | number | bigint;

const INTEGER = /^-?\d+$/;

function toBigInt(value: FameValue): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return Number.isFinite(value) ? BigInt(Math.trunc(value)) : null;
  return INTEGER.test(value.trim()) ? BigInt(value.trim()) : null;
}

/**
 * Formats a fame value for display.
 * `compact` gives "1.2M"; otherwise the exact value with separators ("1,234,567").
 */
export function formatFame(value: FameValue, { compact = false }: { compact?: boolean } = {}): string {
  const fame = toBigInt(value);
  if (fame === null) return String(value);

  if (compact) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(fame));
  }
  return fame.toLocaleString("en-US");
}

/** Kill fame divided by death fame, or null when the player has never died. */
export function fameRatio(killFame: FameValue, deathFame: FameValue): number | null {
  const kills = toBigInt(killFame);
  const deaths = toBigInt(deathFame);
  if (kills === null || deaths === null || deaths === BigInt(0)) return null;
  return Number(kills) / Number(deaths);
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Formats a timestamp in UTC so server and client output always match. */
export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? String(value) : `${DATE_FORMAT.format(date)} UTC`;
}

/**
 * Turns an Albion item type into something readable:
 * "T8_MAIN_HOLYSTAFF@3" becomes "T8.3 Main Holystaff".
 * Anything that does not look like an item type is returned unchanged.
 */
export function formatItemType(itemType: string): string {
  const [base, enchantment] = itemType.split("@");
  const parts = base.split("_").filter(Boolean);

  if (parts.length === 0) return itemType;

  const hasTier = /^T\d$/.test(parts[0]!);
  const tier = hasTier ? `${parts[0]}${enchantment ? `.${enchantment}` : ""}` : "";
  const words = (hasTier ? parts.slice(1) : parts)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");

  return [tier, words].filter(Boolean).join(" ") || itemType;
}
