import catalogue from "./data/equipment-item-names.json";
import { formatItemType } from "./format";

const itemNames: Readonly<Record<string, string>> = catalogue.names;

/** Resolve the readable game name without shipping the catalogue to the browser. */
export function equipmentItemName(itemId: string): string {
  const id = itemId.trim();
  const baseId = id.replace(/@\d+$/, "");
  const name = itemNames[baseId];
  if (typeof name !== "string") return formatItemType(id);

  const tier = /^T([1-8])_/.exec(id)?.[1];
  const enchantment = /@(\d+)$/.exec(id)?.[1];
  return tier
    ? `T${tier}${enchantment && enchantment !== "0" ? `.${enchantment}` : ""} · ${name}`
    : name;
}
