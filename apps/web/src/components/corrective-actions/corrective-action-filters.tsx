"use client";

import { SelectField } from "@/components/ui/fields";
import { Button } from "@/components/ui/feedback";
import type { SiteSummary } from "@/lib/api/types";
import {
  hasActiveCorrectiveActionFilters,
  type CorrectiveActionFilterState,
} from "@/lib/corrective-actions";

interface CorrectiveActionFiltersProps {
  filters: CorrectiveActionFilterState;
  onChange: (partial: Partial<CorrectiveActionFilterState>) => void;
  onReset: () => void;
  sites: readonly SiteSummary[];
}

/**
 * Register filters. The API supports site, status, source and overdue
 * filters; there is deliberately no free-text control here.
 */
export function CorrectiveActionFilters({
  filters,
  onChange,
  onReset,
  sites,
}: CorrectiveActionFiltersProps) {
  const active = hasActiveCorrectiveActionFilters(filters);

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5">
      <SelectField
        label="Site"
        id="capa-filter-site"
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
        id="capa-filter-status"
        value={filters.status}
        onChange={(event) =>
          onChange({
            status: event.target.value as CorrectiveActionFilterState["status"],
          })
        }
        options={[
          { value: "", label: "All statuses" },
          { value: "OPEN", label: "Open" },
          { value: "IN_PROGRESS", label: "In progress" },
          { value: "COMPLETED", label: "Completed" },
          { value: "VERIFIED", label: "Verified" },
        ]}
      />

      <SelectField
        label="Source"
        id="capa-filter-source"
        value={filters.source}
        onChange={(event) =>
          onChange({
            source: event.target
              .value as CorrectiveActionFilterState["source"],
          })
        }
        options={[
          { value: "", label: "All sources" },
          { value: "INCIDENT", label: "Incident" },
          { value: "NEAR_MISS", label: "Near miss" },
          { value: "HSE_OBSERVATION", label: "HSE observation" },
          { value: "INSPECTION", label: "Inspection" },
          { value: "OTHER", label: "Other" },
        ]}
      />

      <label className="flex items-end gap-2 pb-2">
        <input
          type="checkbox"
          checked={filters.overdue}
          onChange={(event) => onChange({ overdue: event.target.checked })}
          className="h-4 w-4 rounded border-line text-navy-900 focus:ring-navy-600/30"
        />
        <span className="text-sm text-ink">Overdue only</span>
      </label>

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
