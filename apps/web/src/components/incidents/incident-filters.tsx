"use client";

import { SelectField } from "@/components/ui/fields";
import { Button } from "@/components/ui/feedback";
import type { SiteSummary } from "@/lib/api/types";
import type { IncidentFilterState } from "@/lib/incident-filters";
import { hasActiveIncidentFilters } from "@/lib/incident-filters";
import type { IncidentType } from "@/lib/api/types";

interface IncidentFiltersProps {
  filters: IncidentFilterState;
  onChange: (partial: Partial<IncidentFilterState>) => void;
  onReset: () => void;
  sites: readonly SiteSummary[];
  lockedType?: IncidentType;
}

/**
 * Register filters. The API supports site, status and report-type filters
 * only; there is deliberately no free-text or date control here.
 */
export function IncidentFilters({
  filters,
  onChange,
  onReset,
  sites,
  lockedType,
}: IncidentFiltersProps) {
  const active = hasActiveIncidentFilters(filters, { lockedType });

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
      <SelectField
        label="Site"
        id="incident-filter-site"
        value={filters.siteId}
        onChange={(event) => onChange({ siteId: event.target.value })}
        options={[
          { value: "", label: "All accessible sites" },
          ...sites.map((site) => ({
            value: site.id,
            label: `${site.name} · ${site.code}`,
          })),
        ]}
      />

      <SelectField
        label="Status"
        id="incident-filter-status"
        value={filters.status}
        onChange={(event) =>
          onChange({
            status: event.target.value as IncidentFilterState["status"],
          })
        }
        options={[
          { value: "", label: "All statuses" },
          { value: "REPORTED", label: "Reported" },
          { value: "TRIAGED", label: "Triaged" },
          { value: "CLOSED", label: "Closed" },
        ]}
      />

      {!lockedType && (
        <SelectField
          label="Report type"
          id="incident-filter-type"
          value={filters.type}
          onChange={(event) =>
            onChange({
              type: event.target.value as IncidentFilterState["type"],
            })
          }
          options={[
            { value: "", label: "All report types" },
            { value: "INCIDENT", label: "Incident" },
            { value: "NEAR_MISS", label: "Near miss" },
          ]}
        />
      )}

      <div className="flex items-end">
        <Button
          variant="ghost"
          onClick={onReset}
          disabled={!active}
          className="w-full justify-center sm:w-auto"
        >
          Reset filters
        </Button>
      </div>
    </div>
  );
}
