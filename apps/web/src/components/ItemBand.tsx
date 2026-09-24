// Real item art, served by Albion's own render service. The "@" marking an
// enchantment must be percent-encoded or browsers drop the request.
const ITEMS = [
  "T8_MAIN_HOLYSTAFF@3",
  "T8_2H_CLAYMORE@2",
  "T8_2H_BOW@3",
  "T8_MAIN_ARCANESTAFF@2",
  "T8_2H_AXE@3",
  "T8_MAIN_SPEAR@2",
  "T8_HEAD_PLATE_SET2@1",
  "T8_ARMOR_LEATHER_SET3@3",
  "T8_SHOES_CLOTH_SET3@2",
  "T8_CAPEITEM_FW_MARTLOCK@1",
  "T8_MOUNT_ARMORED_HORSE",
  "T4_POTION_HEAL",
];

const iconUrl = (type: string) =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(type)}.png?size=64`;

/** A band of in-game gear, purely decorative. */
export function ItemBand({ className }: { className?: string }) {
  return (
    <ul
      aria-hidden="true"
      className={`flex flex-wrap items-center justify-center gap-2 ${className ?? ""}`}
    >
      {ITEMS.map((type) => (
        <li
          key={type}
          className="size-11 rounded-lg border border-gold-500/25 bg-iron-900/70 p-0.5 shadow-inner transition-transform duration-200 hover:-translate-y-0.5 hover:border-gold-300/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- icons come straight from Albion's render service */}
          <img
            src={iconUrl(type)}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="size-full object-contain opacity-90"
          />
        </li>
      ))}
    </ul>
  );
}
