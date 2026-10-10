import type { ReactNode } from "react";

export const VERSION = "0.0.0";

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
