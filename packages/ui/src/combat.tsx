import { formatFame } from "./format";

export { formatFame } from "./format";

export interface CombatEventSummary {
  id: string;
  occurredAt: string;
  totalFame: string;
  location: string | null;
  battleId: string | null;
  killer: { id: string; name: string };
  victim: { id: string; name: string };
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
    </article>
  );
}
