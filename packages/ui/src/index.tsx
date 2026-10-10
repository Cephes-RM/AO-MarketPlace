import type { ReactNode } from "react";
import { SiteSearch } from "./site-search";

export const VERSION = "0.0.0";

export { CombatEventCard, EquipmentLoadout, formatFame, formatItemType } from "./combat";
export type { CombatEventSummary } from "./combat";
export { fameRatio } from "./format";
export type { FameValue } from "./format";
export { SiteSearch } from "./site-search";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="brand" href="/" aria-label="Albion Market home">
          <span className="brand__mark" aria-hidden="true">A</span>
          <span>Albion Market</span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="/#players">Players</a>
          <a href="/#guilds">Guilds</a>
          <a href="/#about">About</a>
        </nav>
        <SiteSearch />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer" id="about">
      <div className="site-footer__inner">
        <a className="brand brand--footer" href="/">Albion Market</a>
        <p>
          An independent community project. Not affiliated with Sandbox
          Interactive GmbH. Game data comes from the public Albion Online API;
          records may be incomplete or out of date.
        </p>
      </div>
    </footer>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="page-container">{children}</main>;
}

export function ProfileHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="profile-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description ? <p className="profile-heading__description">{description}</p> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="state-panel" role="status">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function LoadingState({ label = "Loading directory data…" }: { label?: string }) {
  return (
    <div className="state-panel" role="status" aria-live="polite" aria-busy="true">
      <strong>{label}</strong>
      <p>Please wait while we load this page.</p>
    </div>
  );
}

export function ErrorState({
  title = "We couldn’t load this page",
  children = "Please try again in a moment.",
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
