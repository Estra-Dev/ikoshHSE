import type { ReactNode } from "react";

type StatTone = "navy" | "amber" | "red" | "green" | "violet";

const TONE_CLASSES: Record<StatTone, string> = {
  navy: "bg-navy-50 text-navy-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-700",
  violet: "bg-violet-50 text-violet-700",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "navy",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: StatTone;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {label}
        </p>
        {icon && (
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="tabular mt-3 truncate text-2xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}
