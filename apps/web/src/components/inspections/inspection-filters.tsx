"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import type { InspectionAssignee, SiteSummary } from "@/lib/api/types";
import {
  hasActiveInspectionFilters,
  MAX_INSPECTION_SEARCH_LENGTH,
  type InspectionFilterState,
} from "@/lib/inspections";

interface InspectionFiltersProps {
  filters: InspectionFilterState;
  onChange: (partial: Partial<InspectionFilterState>) => void;
  onReset: () => void;
  sites: readonly SiteSummary[];
  assignees: readonly InspectionAssignee[];
}

/**
 * Register filters. Free text is submitted explicitly so typing does not
 * rewrite the URL (and refetch) on every keystroke.
 */
export function InspectionFilters({
  filters,
  onChange,
  onReset,
  sites,
  assignees,
}: InspectionFiltersProps) {
  const [query, setQuery] = useState(filters.q);
  const [previousFilterQuery, setPreviousFilterQuery] = useState(filters.q);

  if (filters.q !== previousFilterQuery) {
    setPreviousFilterQuery(filters.q);
    setQuery(filters.q);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onChange({ q: query.trim().slice(0, MAX_INSPECTION_SEARCH_LENGTH) });
  }

  const active = hasActiveInspectionFilters(filters);

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="Search"
            id="inspection-filter-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={MAX_INSPECTION_SEARCH_LENGTH}
            placeholder="Search inspection title or description"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Site"
          id="inspection-filter-site"
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
          id="inspection-filter-status"
          value={filters.status}
          onChange={(event) =>
            onChange({
              status: event.target.value as InspectionFilterState["status"],
            })
          }
          options={[
            { value: "", label: "All statuses" },
            { value: "SCHEDULED", label: "Scheduled" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "COMPLETED", label: "Completed" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />

        <SelectField
          label="Type"
          id="inspection-filter-type"
          value={filters.type}
          onChange={(event) =>
            onChange({
              type: event.target.value as InspectionFilterState["type"],
            })
          }
          options={[
            { value: "", label: "All types" },
            { value: "ROUTINE", label: "Routine" },
            { value: "FOCUSED", label: "Focused" },
            { value: "FOLLOW_UP", label: "Follow-up" },
          ]}
        />

        <SelectField
          label="Inspector"
          id="inspection-filter-inspector"
          value={filters.inspectorId}
          onChange={(event) => onChange({ inspectorId: event.target.value })}
          options={[
            { value: "", label: "All inspectors" },
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
