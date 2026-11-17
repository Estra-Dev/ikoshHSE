"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import type {
  ProjectSummary,
  SiteSummary,
  TrainingCourseSummary,
} from "@/lib/api/types";
import {
  MAX_TRAINING_SEARCH_LENGTH,
  hasActiveTrainingFilters,
  type TrainingFilterState,
} from "@/lib/training";

interface TrainingFiltersProps {
  filters: TrainingFilterState;
  onChange: (partial: Partial<TrainingFilterState>) => void;
  onReset: () => void;
  courses: readonly TrainingCourseSummary[];
  projects: readonly ProjectSummary[];
  sites: readonly SiteSummary[];
}

/** Training register filters mirrored into the URL for shareable views. */
export function TrainingFilters({
  filters,
  onChange,
  onReset,
  courses,
  projects,
  sites,
}: TrainingFiltersProps) {
  const [query, setQuery] = useState(filters.q);
  const [previousFilterQuery, setPreviousFilterQuery] = useState(filters.q);

  if (filters.q !== previousFilterQuery) {
    setPreviousFilterQuery(filters.q);
    setQuery(filters.q);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onChange({ q: query.trim().slice(0, MAX_TRAINING_SEARCH_LENGTH) });
  }

  const active = hasActiveTrainingFilters(filters);

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <TextField
            label="Search"
            id="training-filter-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={MAX_TRAINING_SEARCH_LENGTH}
            placeholder="Search topic, trainer or course"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Status"
          id="training-filter-status"
          value={filters.status}
          onChange={(event) =>
            onChange({
              status: event.target.value as TrainingFilterState["status"],
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
          label="Course"
          id="training-filter-course"
          value={filters.courseId}
          onChange={(event) => onChange({ courseId: event.target.value })}
          options={[
            { value: "", label: "All courses" },
            ...courses.map((course) => ({
              value: course.id,
              label: `${course.title} · ${course.code}`,
            })),
          ]}
        />

        <SelectField
          label="Project"
          id="training-filter-project"
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
          id="training-filter-site"
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

        <TextField
          label="From"
          id="training-filter-from"
          type="date"
          value={filters.from}
          onChange={(event) => onChange({ from: event.target.value })}
        />

        <TextField
          label="To"
          id="training-filter-to"
          type="date"
          value={filters.to}
          onChange={(event) => onChange({ to: event.target.value })}
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
