import type { ReactNode } from "react";

/** Label/value pair used across profile pages. */
export function ProfileField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

/** Card grouping a set of profile fields. */
export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description && (
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      )}
      <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

/** Formats an ISO date string for display, or an em dash when unset. */
export function formatProfileDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

/** Formats an enum-like value ("FULL_TIME") for display. */
export function formatEnum(value: string | null): string {
  return value ? value.replaceAll("_", " ") : "—";
}
