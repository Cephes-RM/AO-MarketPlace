import { formatFame, formatItemType } from "./format";

export { formatFame, formatItemType } from "./format";

type EquipmentItem = { id: string; quality?: number; count?: number };

const EQUIPMENT_SLOTS = [
  ["main_hand", "Main hand"],
  ["off_hand", "Off hand"],
  ["head", "Head"],
  ["body", "Armor"],
  ["shoe", "Shoes"],
  ["cape", "Cape"],
  ["bag", "Bag"],
  ["mount", "Mount"],
  ["potion", "Potion"],
  ["food", "Food"],
] as const;

type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number][0];
type Equipment = Partial<Record<EquipmentSlot, EquipmentItem | null>>;

export interface CombatEventSummary {
  id: string;
  occurredAt: string;
  totalFame: string;
  location: string | null;
  battleId: string | null;
  killer: { id: string; name: string };
  victim: { id: string; name: string };
  killerLoadout: Equipment;
  victimLoadout: Equipment;
  killerItemPower: number | null;
  victimItemPower: number | null;
}

const QUALITY_NAMES: Record<number, string> = {
  1: "Normal",
  2: "Good",
  3: "Outstanding",
  4: "Excellent",
  5: "Masterpiece",
};

function formatItemPower(value: number | null): string {
  return value !== null && Number.isFinite(value) && value > 0
    ? `${value.toLocaleString("en", { maximumFractionDigits: 1 })} IP`
    : "Item power not recorded";
}

export function EquipmentLoadout({ equipment }: { equipment: Equipment }) {
  const recorded = EQUIPMENT_SLOTS.some(([slot]) => equipment[slot]);
  if (!recorded) {
    return <p className="equipment-unavailable">No equipment was recorded for this player in this event.</p>;
  }

  return (
    <dl className="equipment-grid">
      {EQUIPMENT_SLOTS.map(([slot, label]) => {
        const item = equipment[slot];
        return (
          <div className={`equipment-slot${item ? "" : " equipment-slot--empty"}`} key={slot}>
            <dt>{label}</dt>
            <dd>
              {item ? (
                <>
                  <span className="equipment-slot__item" title={item.id}>{formatItemType(item.id)}</span>
                  <span className="equipment-slot__meta">
                    {item.quality ? QUALITY_NAMES[item.quality] : "Quality not recorded"}
                    {item.count && item.count > 1 ? ` · ×${item.count}` : ""}
                  </span>
                </>
              ) : <span className="equipment-slot__meta">Not recorded</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function CombatEventCard({ event, kind }: { event: CombatEventSummary; kind: "kill" | "death" }) {
  const timestamp = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(event.occurredAt));

  return (
    <article className="combat-card" aria-label={`${kind === "kill" ? "Kill" : "Death"} event ${event.id}`}>
      <div className="combat-card__heading">
        <span className={`combat-badge combat-badge--${kind}`}>{kind === "kill" ? "Kill" : "Death"}</span>
        <time dateTime={event.occurredAt}>{timestamp} UTC</time>
      </div>
      <p className="combat-matchup">
        <a href={`/players/${encodeURIComponent(event.killer.id)}`}>{event.killer.name}</a>
        <span>defeated</span>
        <a href={`/players/${encodeURIComponent(event.victim.id)}`}>{event.victim.name}</a>
      </p>
      <dl className="combat-facts">
        <div><dt>Kill fame</dt><dd>{formatFame(event.totalFame)}</dd></div>
        <div><dt>Location</dt><dd>{event.location?.trim() || "Not recorded"}</dd></div>
        <div><dt>Event ID</dt><dd>{event.id}</dd></div>
        {event.battleId ? <div><dt>Battle ID</dt><dd>{event.battleId}</dd></div> : null}
      </dl>
      <details className="combat-equipment">
        <summary>Equipment worn in this fight <span aria-hidden="true">+</span></summary>
        <div className="combat-equipment__players">
          <section aria-label={`${event.killer.name} equipment`}>
            <h3>{event.killer.name} <span>Killer · {formatItemPower(event.killerItemPower)}</span></h3>
            <EquipmentLoadout equipment={event.killerLoadout} />
          </section>
          <section aria-label={`${event.victim.name} equipment`}>
            <h3>{event.victim.name} <span>Victim · {formatItemPower(event.victimItemPower)}</span></h3>
            <EquipmentLoadout equipment={event.victimLoadout} />
          </section>
        </div>
      </details>
    </article>
  );
}
