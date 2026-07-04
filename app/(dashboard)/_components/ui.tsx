import type { ReactNode } from "react";
import type { CaseStatus, UrgencyLevel } from "@/lib/schemas/db";

// Fixed UTC formatting so server-rendered timestamps are deterministic (no locale/TZ drift).
const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});
const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDateTime(value: Date | null | undefined): string {
  return value ? `${DATE_TIME.format(value)} UTC` : "—";
}

export function formatDate(value: Date | null | undefined): string {
  return value ? DATE.format(value) : "—";
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`badge status-${status}`}>{status.replace("_", " ")}</span>;
}

export function UrgencyBadge({ urgency }: { urgency: UrgencyLevel }) {
  return <span className={`badge urgency-${urgency}`}>{urgency}</span>;
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
