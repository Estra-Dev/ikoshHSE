"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import type {
  RiskAssessmentAssignee,
  SiteSummary,
} from "@/lib/api/types";
import {
  hasActiveRiskAssessmentFilters,
  MAX_RISK_SEARCH_LENGTH,
  type RiskAssessmentFilterState,
} from "@/lib/risk-assessments";

interface RiskAssessmentFiltersProps {
  filters: RiskAssessmentFilterState;
  onChange: (partial: Partial<RiskAssessmentFilterState>) => void;
  onReset: () => void;
  sites: readonly SiteSummary[];
  assignees: readonly RiskAssessmentAssignee[];
}

/**
 * Register filters. Free text is submitted explicitly so typing does not
 * rewrite the URL (and refetch) on every keystroke.
 */
export function RiskAssessmentFilters({
  filters,
  onChange,
  onReset,
  sites,
  assignees,
}: RiskAssessmentFiltersProps) {
  const [query, setQuery] = useState(filters.q);
  const [previousFilterQuery, setPreviousFilterQuery] = useState(filters.q);

  if (filters.q !== previousFilterQuery) {
    setPreviousFilterQuery(filters.q);
    setQuery(filters.q);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onChange({ q: query.trim().slice(0, MAX_RISK_SEARCH_LENGTH) });
  }

  const active = hasActiveRiskAssessmentFilters(filters);

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="Search"
            id="risk-filter-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={MAX_RISK_SEARCH_LENGTH}
            placeholder="Search assessment title or description"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Site"
          id="risk-filter-site"
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
          id="risk-filter-status"
          value={filters.status}
          onChange={(event) =>
            onChange({
              status: event.target
                .value as RiskAssessmentFilterState["status"],
            })
          }
          options={[
            { value: "", label: "All statuses" },
            { value: "DRAFT", label: "Draft" },
            { value: "IN_REVIEW", label: "In review" },
            { value: "APPROVED", label: "Approved" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
        />

        <SelectField
          label="Owner"
          id="risk-filter-owner"
          value={filters.ownerId}
          onChange={(event) => onChange({ ownerId: event.target.value })}
          options={[
            { value: "", label: "All owners" },
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
