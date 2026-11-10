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
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-zinc-900 dark:text-white">
        {value}
      </dd>
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      )}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  return value ? value.replace("_", " ") : "—";
}
