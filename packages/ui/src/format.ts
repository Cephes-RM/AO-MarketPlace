export type FameValue = string | bigint | number;

const ZERO = BigInt(0);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

function readFame(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= ZERO ? value : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  return BigInt(value.trim());
}

/** Format fame without losing precision or treating malformed values as zero. */
export function formatFame(value: unknown): string {
  return readFame(value)?.toLocaleString("en") ?? "Unavailable";
}

/** Kill fame / death fame, rounded to two decimals using integer arithmetic. */
export function fameRatio(killFame: unknown, deathFame: unknown): string {
  const kills = readFame(killFame);
  const deaths = readFame(deathFame);
  if (kills === null || deaths === null) return "Unavailable";
  if (deaths === ZERO) return kills > ZERO ? "∞" : "—";
  const hundredths = (kills * HUNDRED + deaths / TWO) / deaths;
  return `${hundredths / HUNDRED}.${String(hundredths % HUNDRED).padStart(2, "0")}`;
}

/** Keep the tier and enchantment visible while making item codes readable. */
export function formatItemType(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Unknown item";
  const id = value.trim();
  const match = /^T([1-9]\d*)_(.+?)(?:@(\d+))?$/.exec(id);
  if (!match) return id.replaceAll("_", " ");
  const [, tier, item, enchantment] = match;
  return `T${tier}${enchantment ? `.${enchantment}` : ""} · ${item.replaceAll("_", " ")}`;
}
