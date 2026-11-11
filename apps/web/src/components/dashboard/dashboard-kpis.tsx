import {
  ClockIcon,
  IncidentIcon,
  InfoIcon,
  ShieldIcon,
} from "@/components/icons";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardKpis } from "@/lib/hse-dashboard";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function DashboardKpis({ kpis }: { kpis: DashboardKpis | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
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

      <StatCard
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

      <StatCard
        label="Open cases"
        value={kpis ? kpis.openCases : "…"}
        hint="Reported or triaged"
        icon={<ClockIcon size={18} />}
        tone="amber"
      />

      <StatCard
        label="Unclassified"
        value={kpis ? kpis.unclassified : "…"}
        hint="Awaiting HSE classification"
        icon={<ShieldIcon size={18} />}
        tone="violet"
      />
    </div>
  );
}
