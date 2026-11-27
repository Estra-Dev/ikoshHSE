import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  ClockIcon,
  IncidentIcon,
  InfoIcon,
  ShieldIcon,
} from "@/components/icons";
import {
  appendSiteFilter,
  type DashboardKpis,
  type ReportKpis,
} from "@/lib/hse-dashboard";

type KpiTone = "navy" | "amber" | "red" | "green" | "violet";

const TONE_ICON_CLASSES: Record<KpiTone, string> = {
  navy: "bg-navy-50 text-navy-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  green: "bg-emerald-50 text-emerald-700",
  violet: "bg-violet-50 text-violet-700",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function KpiCard({
  href,
  label,
  value,
  hint,
  icon,
  tone = "navy",
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: KpiTone;
}) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col rounded-card border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-navy-300 hover:bg-navy-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1 text-xs font-semibold leading-4 text-muted">
          {label}
        </span>
        {icon && (
          <span
            aria-hidden="true"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON_CLASSES[tone]}`}
          >
            {icon}
          </span>
        )}
      </div>

      <p className="tabular mt-4 text-3xl font-semibold leading-none tracking-tight text-ink">
        {value}
      </p>

      {hint && (
        <p className="mt-2 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted">
          {hint}
        </p>
      )}
    </Link>
  );
}

interface DashboardKpisProps {
  kpis: DashboardKpis | null;
  reportKpis?: ReportKpis | null;
  showReportKpis?: boolean;
  reportLoading?: boolean;
  reportError?: unknown;
  siteId?: string;
}

export function DashboardKpis({
  kpis,
  reportKpis,
  showReportKpis = false,
  reportLoading = false,
  reportError,
  siteId = "",
}: DashboardKpisProps) {
  const scoped = (href: string) => appendSiteFilter(href, siteId);
  const reportValue = (value: number | undefined): string => {
    if (value !== undefined) {
      return String(value);
    }
    return reportError ? "—" : "…";
  };
  const reportHint = (hint: string): string => {
    if (reportError) {
      return "Unable to load cross-module aggregates";
    }
    if (reportLoading || !reportKpis) {
      return "Loading cross-module aggregates";
    }
    return hint;
  };

  const gridClasses = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

  if (!showReportKpis) {
    return (
      <div className={gridClasses}>
        <KpiCard
          href={scoped("/incidents")}
          label="Incidents"
          value={kpis ? kpis.incidents : "…"}
          hint={
            kpis
              ? kpis.totalReports > 0
                ? `${kpis.totalReports} total reports including near misses`
                : "No reports in this period"
              : "Loading HSE aggregates"
          }
          icon={<IncidentIcon size={18} />}
          tone="red"
        />

        <KpiCard
          href={scoped("/near-misses")}
          label="Near misses"
          value={kpis ? kpis.nearMisses : "…"}
          hint={
            kpis
              ? kpis.totalReports > 0
                ? `${percent(kpis.nearMissShare)} of all reports`
                : "No reports in this period"
              : "Loading HSE aggregates"
          }
          icon={<InfoIcon size={18} />}
          tone="navy"
        />

        <KpiCard
          href={scoped("/incidents")}
          label="Open cases"
          value={kpis ? kpis.openCases : "…"}
          hint="Reported or triaged"
          icon={<ClockIcon size={18} />}
          tone="amber"
        />

        <KpiCard
          href={scoped("/incidents")}
          label="Unclassified"
          value={kpis ? kpis.unclassified : "…"}
          hint="Awaiting HSE classification"
          icon={<ShieldIcon size={18} />}
          tone="violet"
        />
      </div>
    );
  }

  return (
    <div className={gridClasses}>
      <KpiCard
        href={scoped("/incidents")}
        label="Incidents"
        value={kpis ? kpis.incidents : "…"}
        hint={
          kpis
            ? kpis.totalReports > 0
              ? `${kpis.openCases} open cases in this period`
              : "No reports in this period"
            : "Loading HSE aggregates"
        }
        icon={<IncidentIcon size={18} />}
        tone="red"
      />

      <KpiCard
        href={scoped("/near-misses")}
        label="Near misses"
        value={kpis ? kpis.nearMisses : "…"}
        hint={
          kpis
            ? kpis.totalReports > 0
              ? `${percent(kpis.nearMissShare)} of all reports`
              : "No reports in this period"
            : "Loading HSE aggregates"
        }
        icon={<InfoIcon size={18} />}
        tone="navy"
      />

      <KpiCard
        href={scoped("/corrective-actions")}
        label="Open CAPAs"
        value={reportValue(reportKpis?.openCapas)}
        hint={reportHint("Open or in progress")}
        icon={<ClockIcon size={18} />}
        tone="amber"
      />

      <KpiCard
        href={scoped("/corrective-actions?overdue=true")}
        label="Overdue CAPAs"
        value={reportValue(reportKpis?.overdueCapas)}
        hint={reportHint("Past due and still open · current status")}
        icon={<ClockIcon size={18} />}
        tone="red"
      />

      <KpiCard
        href={scoped("/permits?status=ACTIVE")}
        label="Active permits"
        value={reportValue(reportKpis?.activePermits)}
        hint={reportHint("Activated permits in scope")}
        icon={<ClipboardCheckIcon size={18} />}
        tone="green"
      />

      <KpiCard
        href={scoped("/inspections?status=COMPLETED")}
        label="Inspections completed"
        value={reportValue(reportKpis?.completedInspections)}
        hint={reportHint("Completed in this period")}
        icon={<CheckCircleIcon size={18} />}
        tone="navy"
      />

      <KpiCard
        href={scoped("/risk-assessments")}
        label="Open risk assessments"
        value={reportValue(reportKpis?.openRiskAssessments)}
        hint={reportHint("Draft or in review")}
        icon={<ShieldIcon size={18} />}
        tone="violet"
      />

      <KpiCard
        href={scoped("/training")}
        label="Training follow-up"
        value={reportValue(reportKpis?.trainingFollowUp)}
        hint={reportHint("Absent participants in this period")}
        icon={<BookIcon size={18} />}
        tone="amber"
      />
    </div>
  );
}
