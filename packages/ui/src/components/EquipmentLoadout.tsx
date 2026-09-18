import { cn } from "../lib/cn";
import { formatItemType } from "../lib/format";

/** The Albion equipment slots, in the order they are shown. */
export const EQUIPMENT_SLOTS = [
  "mainHand",
  "offHand",
  "head",
  "armor",
  "shoes",
  "cape",
  "bag",
  "mount",
  "potion",
  "food",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

const SLOT_LABELS: Record<string, string> = {
  mainHand: "Main hand",
  offHand: "Off hand",
  head: "Head",
  armor: "Armor",
  shoes: "Shoes",
  cape: "Cape",
  bag: "Bag",
  mount: "Mount",
  potion: "Potion",
  food: "Food",
};

export interface EquipmentItem {
  /** An Albion equipment slot, e.g. "mainHand". Unknown slots are ignored. */
  slot: string;
  /** The Albion item type, e.g. "T8_MAIN_HOLYSTAFF@3". */
  itemType: string;
  quality?: number | null;
  count?: number | null;
}

export interface EquipmentLoadoutProps {
  items: EquipmentItem[];
  /** Whose loadout this is, shown above the slots. */
  label?: string;
  /** Slots to show, in order. Defaults to every Albion slot. */
  slots?: readonly string[];
  /** Override where item icons come from. Return null to render no image. */
  getIconUrl?: (item: EquipmentItem) => string | null;
  emptyMessage?: string;
  className?: string;
}

// Albion renders item icons straight from its own service, no API key needed.
// The "@" marking an enchantment must be percent-encoded or browsers drop the request.
const defaultIconUrl = (item: EquipmentItem): string | null => {
  const type = item.itemType.replace(/[^A-Za-z0-9_@]/g, "");
  if (!type) return null;

  const quality = item.quality && item.quality > 0 ? `&quality=${item.quality}` : "";
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(type)}.png?size=64${quality}`;
};

/**
 * The gear worn during a kill event, one tile per slot.
 * An empty slot renders a placeholder, so a partly recorded loadout still
 * lines up with a complete one.
 */
export function EquipmentLoadout({
  items,
  label,
  slots = EQUIPMENT_SLOTS,
  getIconUrl = defaultIconUrl,
  emptyMessage = "No equipment recorded for this event.",
  className,
}: EquipmentLoadoutProps) {
  const itemBySlot = new Map(items.map((item) => [item.slot, item]));

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {slots.map((slot) => {
            const item = itemBySlot.get(slot);
            const slotLabel = SLOT_LABELS[slot] ?? slot;

            if (!item) {
              return (
                <li
                  key={slot}
                  title={`${slotLabel}: empty`}
                  aria-label={`${slotLabel}: empty`}
                  className="size-10 rounded-md border border-dashed border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/40"
                />
              );
            }

            const iconUrl = getIconUrl(item);
            const name = formatItemType(item.itemType);

            return (
              <li
                key={slot}
                title={`${slotLabel}: ${name}`}
                className="relative size-10 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
              >
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- icons come straight from Albion's render service
                  <img
                    src={iconUrl}
                    alt={`${slotLabel}: ${name}`}
                    width={40}
                    height={40}
                    loading="lazy"
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-[10px] text-neutral-500">
                    {slotLabel}
                  </span>
                )}
                {item.count && item.count > 1 ? (
                  <span className="absolute right-0 bottom-0 rounded-tl bg-neutral-900/80 px-1 text-[10px] leading-4 font-medium text-white">
                    {item.count}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
