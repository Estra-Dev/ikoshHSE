"use client";

import { Card, CardBody } from "@/components/ui/card";
import { SelectField } from "@/components/ui/fields";
import type { ProjectSummary, SiteSummary } from "@/lib/api/types";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  DASHBOARD_RANGE_LABELS,
  DASHBOARD_RANGES,
  type DashboardRange,
} from "@/lib/hse-dashboard";

export function DashboardScopeControls({
  range,
  projectId,
  siteId,
  projects,
  sites,
  scopeLabel,
  scopeNote,
  isFetching,
  lastUpdated,
  projectsLoading,
  sitesLoading,
  onRangeChange,
  onProjectChange,
  onSiteChange,
}: {
  range: DashboardRange;
  projectId: string;
  siteId: string;
  projects: ProjectSummary[];
  sites: SiteSummary[];
  scopeLabel: string;
  scopeNote: string;
  isFetching: boolean;
  lastUpdated?: string;
  projectsLoading: boolean;
  sitesLoading: boolean;
  onRangeChange: (range: DashboardRange) => void;
  onProjectChange: (projectId: string) => void;
  onSiteChange: (siteId: string) => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Reporting period"
            id="dashboard-range"
            value={range}
            onChange={(event) =>
              onRangeChange(event.target.value as DashboardRange)
            }
            options={DASHBOARD_RANGES.map((value) => ({
              value,
              label: DASHBOARD_RANGE_LABELS[value],
            }))}
          />

          <SelectField
            label="Project"
            id="dashboard-project"
            value={projectId}
            onChange={(event) => onProjectChange(event.target.value)}
            disabled={projectsLoading}
            options={[
              {
                value: "",
                label: projectsLoading ? "Loading projects…" : "All projects",
              },
              ...projects.map((project) => ({
                value: project.id,
                label: `${project.name} (${project.code})`,
              })),
            ]}
          />

          <SelectField
            label="Site"
            id="dashboard-site"
            value={siteId}
            onChange={(event) => onSiteChange(event.target.value)}
            disabled={sitesLoading}
            options={[
              {
                value: "",
                label: sitesLoading
                  ? "Loading sites…"
                  : "All accessible sites",
              },
              ...sites.map((site) => ({
                value: site.id,
                label: `${site.name} (${site.code})`,
              })),
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{scopeLabel}</span>
            <span className="mx-1.5 text-line">/</span>
            {DASHBOARD_RANGE_LABELS[range]}
            <span className="mx-1.5 text-line">/</span>
            {scopeNote}
          </p>
          {isFetching ? (
            <p className="text-xs text-navy-600" role="status">
              Updating…
            </p>
          ) : lastUpdated ? (
            <p className="text-xs text-muted">
              Updated {formatUtcDateTime(lastUpdated)}
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
