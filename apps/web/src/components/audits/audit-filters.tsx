"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import type { AuditAssignee, SiteSummary } from "@/lib/api/types";
import {
  hasActiveAuditFilters,
  MAX_AUDIT_SEARCH_LENGTH,
  type AuditFilterState,
} from "@/lib/audits";

interface AuditFiltersProps {
  filters: AuditFilterState;
  onChange: (partial: Partial<AuditFilterState>) => void;
  onReset: () => void;
  sites: readonly SiteSummary[];
  auditors: readonly AuditAssignee[];
}

/**
 * Register filters. Free text is submitted explicitly so typing does not
 * rewrite the URL (and refetch) on every keystroke.
 */
export function AuditFilters({
  filters,
  onChange,
  onReset,
  sites,
  auditors,
}: AuditFiltersProps) {
  const [query, setQuery] = useState(filters.q);
  const [previousFilterQuery, setPreviousFilterQuery] = useState(filters.q);

  if (filters.q !== previousFilterQuery) {
    setPreviousFilterQuery(filters.q);
    setQuery(filters.q);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onChange({ q: query.trim().slice(0, MAX_AUDIT_SEARCH_LENGTH) });
  }

  const active = hasActiveAuditFilters(filters);

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="Search"
            id="audit-filter-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={MAX_AUDIT_SEARCH_LENGTH}
            placeholder="Search audit title or description"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Site"
          id="audit-filter-site"
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
          id="audit-filter-status"
          value={filters.status}
          onChange={(event) =>
            onChange({
              status: event.target.value as AuditFilterState["status"],
            })
          }
          options={[
            { value: "", label: "All statuses" },
            { value: "PLANNED", label: "Planned" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "COMPLETED", label: "Completed" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />

        <SelectField
          label="Type"
          id="audit-filter-type"
          value={filters.type}
          onChange={(event) =>
            onChange({
              type: event.target.value as AuditFilterState["type"],
            })
          }
          options={[
            { value: "", label: "All types" },
            { value: "INTERNAL", label: "Internal" },
            { value: "EXTERNAL", label: "External" },
            { value: "SUPPLIER", label: "Supplier" },
            { value: "CERTIFICATION", label: "Certification" },
          ]}
        />

        <SelectField
          label="Auditor"
          id="audit-filter-auditor"
          value={filters.auditorId}
          onChange={(event) => onChange({ auditorId: event.target.value })}
          options={[
            { value: "", label: "All auditors" },
            ...auditors.map((auditor) => ({
              value: auditor.id,
              label:
                `${auditor.firstName} ${auditor.lastName}`.trim() ||
                auditor.id,
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
