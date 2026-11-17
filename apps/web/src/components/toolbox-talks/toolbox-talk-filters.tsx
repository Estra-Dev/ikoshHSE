"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import type { ProjectSummary, SiteSummary } from "@/lib/api/types";
import {
  MAX_TOOLBOX_TALK_SEARCH_LENGTH,
  hasActiveToolboxTalkFilters,
  type ToolboxTalkFilterState,
} from "@/lib/toolbox-talks";

interface ToolboxTalkFiltersProps {
  filters: ToolboxTalkFilterState;
  onChange: (partial: Partial<ToolboxTalkFilterState>) => void;
  onReset: () => void;
  projects: readonly ProjectSummary[];
  sites: readonly SiteSummary[];
}

/** Toolbox talk register filters mirrored into the URL for shareable views. */
export function ToolboxTalkFilters({
  filters,
  onChange,
  onReset,
  projects,
  sites,
}: ToolboxTalkFiltersProps) {
  const [query, setQuery] = useState(filters.q);
  const [previousFilterQuery, setPreviousFilterQuery] = useState(filters.q);

  if (filters.q !== previousFilterQuery) {
    setPreviousFilterQuery(filters.q);
    setQuery(filters.q);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onChange({
      q: query.trim().slice(0, MAX_TOOLBOX_TALK_SEARCH_LENGTH),
    });
  }

  const active = hasActiveToolboxTalkFilters(filters);

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="Search"
            id="toolbox-talk-filter-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={MAX_TOOLBOX_TALK_SEARCH_LENGTH}
            placeholder="Search topic, facilitator or discussion points"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Status"
          id="toolbox-talk-filter-status"
          value={filters.status}
          onChange={(event) =>
            onChange({
              status: event.target.value as ToolboxTalkFilterState["status"],
            })
          }
          options={[
            { value: "", label: "All statuses" },
            { value: "SCHEDULED", label: "Scheduled" },
            { value: "COMPLETED", label: "Completed" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />

        <SelectField
          label="Project"
          id="toolbox-talk-filter-project"
          value={filters.projectId}
          onChange={(event) =>
            onChange({ projectId: event.target.value, siteId: "" })
          }
          options={[
            { value: "", label: "All projects" },
            ...projects.map((project) => ({
              value: project.id,
              label: `${project.name} · ${project.code}`,
            })),
          ]}
        />

        <SelectField
          label="Site"
          id="toolbox-talk-filter-site"
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

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="From"
            id="toolbox-talk-filter-from"
            type="date"
            value={filters.from}
            onChange={(event) => onChange({ from: event.target.value })}
          />

          <TextField
            label="To"
            id="toolbox-talk-filter-to"
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onReset} disabled={!active}>
          Reset filters
        </Button>
      </div>
    </div>
  );
}
