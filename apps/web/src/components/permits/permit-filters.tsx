"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import type { PermitAssignee, SiteSummary } from "@/lib/api/types";
import {
  hasActivePermitFilters,
  MAX_PERMIT_SEARCH_LENGTH,
  type PermitFilterState,
} from "@/lib/permits";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { PERMIT_STATUSES, PERMIT_TO_WORK_TYPES } from "@/lib/api/types";

interface PermitFiltersProps {
  filters: PermitFilterState;
  onChange: (partial: Partial<PermitFilterState>) => void;
  onReset: () => void;
  sites: readonly SiteSummary[];
  assignees: readonly PermitAssignee[];
}

/**
 * Register filters. Free text is submitted explicitly so typing does not
 * rewrite the URL (and refetch) on every keystroke.
 */
export function PermitFilters({
  filters,
  onChange,
  onReset,
  sites,
  assignees,
}: PermitFiltersProps) {
  const [query, setQuery] = useState(filters.q);
  const [previousFilterQuery, setPreviousFilterQuery] = useState(filters.q);

  if (filters.q !== previousFilterQuery) {
    setPreviousFilterQuery(filters.q);
    setQuery(filters.q);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onChange({ q: query.trim().slice(0, MAX_PERMIT_SEARCH_LENGTH) });
  }

  const active = hasActivePermitFilters(filters);

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="Search"
            id="permit-filter-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={MAX_PERMIT_SEARCH_LENGTH}
            placeholder="Search work description or location"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Site"
          id="permit-filter-site"
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
          id="permit-filter-status"
          value={filters.status}
          onChange={(event) =>
            onChange({
              status: event.target.value as PermitFilterState["status"],
            })
          }
          options={[
            { value: "", label: "All statuses" },
            ...PERMIT_STATUSES.map((status) => ({
              value: status,
              label: formatHseLabel(status),
            })),
          ]}
        />

        <SelectField
          label="Work type"
          id="permit-filter-work-type"
          value={filters.workType}
          onChange={(event) =>
            onChange({
              workType: event.target.value as PermitFilterState["workType"],
            })
          }
          options={[
            { value: "", label: "All work types" },
            ...PERMIT_TO_WORK_TYPES.map((workType) => ({
              value: workType,
              label: formatHseLabel(workType),
            })),
          ]}
        />

        <SelectField
          label="Responsible"
          id="permit-filter-responsible"
          value={filters.responsiblePersonId}
          onChange={(event) =>
            onChange({ responsiblePersonId: event.target.value })
          }
          options={[
            { value: "", label: "All responsible people" },
            ...assignees.map((assignee) => ({
              value: assignee.id,
              label:
                `${assignee.firstName} ${assignee.lastName}`.trim() ||
                assignee.id,
            })),
          ]}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onReset} disabled={!active}>
          Reset filters
        </Button>
      </div>
    </div>
  );
}
