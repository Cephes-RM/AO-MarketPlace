import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

// Pin the source so catalogue changes are explicit and reviewable.
const DEFAULT_REVISION = "1a469e53de028c5f85cdd80505f10cbd0a2515cf";
const { values } = parseArgs({
  options: {
    revision: { type: "string", default: DEFAULT_REVISION },
    source: { type: "string" },
  },
});
if (!/^[a-f0-9]{40}$/.test(values.revision)) throw new Error("Pass a full upstream commit SHA.");

const source = `https://raw.githubusercontent.com/ao-data/ao-bin-dumps/${values.revision}/formatted/items.json`;
let raw;
if (values.source) {
  raw = await readFile(values.source, "utf8");
} else {
  const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Catalogue download failed: HTTP ${response.status}`);
  raw = await response.text();
}
const items = JSON.parse(raw);
if (!Array.isArray(items)) throw new Error("The upstream item catalogue must be an array.");

// Keep only base equipment IDs and English names, rather than the full dump.
// Enchanted variants reuse the base name; their tier/enchantment remains visible.
const equipment = /^(?:T[1-8]_(?:MAIN_|2H_|OFF_|HEAD_|ARMOR_|SHOES_|CAPE(?:ITEM)?(?:_|$)|BAG(?:_|$)|MOUNT_|POTION_|MEAL_|FOOD_)|UNIQUE_(?:MAIN_|2H_|OFF_|HEAD_|ARMOR_|SHOES_|CAPE|BAG|MOUNT|POTION|MEAL|FOOD))/;
const names = new Map();
for (const item of items) {
  const id = item?.UniqueName;
  const name = item?.LocalizedNames?.["EN-US"];
  if (typeof id !== "string" || typeof name !== "string" || !name.trim()) continue;
  if (!/^[A-Z0-9_]+$/.test(id) || !equipment.test(id)) continue;
  names.set(id, name.trim());
}
if (names.size === 0) throw new Error("No equipment names found; the existing catalogue was preserved.");

const output = new URL("../packages/ui/src/data/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("equipment-item-names.json", output), JSON.stringify({
  source,
  revision: values.revision,
  locale: "EN-US",
  names: Object.fromEntries([...names].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)),
}, null, 2) + "\n");
console.log(`Updated ${names.size} base equipment names from ao-data/ao-bin-dumps at ${values.revision}.`);
