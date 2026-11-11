"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { InfoIcon, RefreshIcon } from "@/components/icons";
import { useRecentIncidents } from "@/lib/api/hse";
import type {
  IncidentStatus,
  IncidentType,
  SiteSummary,
} from "@/lib/api/types";
import { formatUtcDate } from "@/lib/dashboard-format";
import {
  canScopeRecentReports,
  formatHseLabel,
  type DashboardScopeFilters,
} from "@/lib/hse-dashboard";

const STATUS_TONES: Record<IncidentStatus, BadgeTone> = {
  REPORTED: "amber",
  TRIAGED: "blue",
  CLOSED: "green",
};

const TYPE_TONES: Record<IncidentType, BadgeTone> = {
  INCIDENT: "red",
  NEAR_MISS: "blue",
};

/**
 * Latest five reports. The incident endpoint is site-scoped only, so a
 * project-only scope deliberately renders an explanation rather than an
 * unfiltered feed. Reporter identities are never requested or displayed.
 */
export function LatestReports({
  filters,
  sites,
}: {
  filters: DashboardScopeFilters;
  sites: readonly SiteSummary[];
}) {
  const enabled = canScopeRecentReports(filters);
  const reports = useRecentIncidents({
    siteId: filters.siteId,
    limit: 5,
    enabled,
  });

  const siteNames = new Map(sites.map((site) => [site.id, site.name]));
  const selectedSite = filters.siteId
    ? sites.find((site) => site.id === filters.siteId)
    : undefined;
  const items = reports.data?.incidents ?? [];

  return (
    <Card>
      <CardHeader
        title="Latest reports"
        description={
          enabled
            ? selectedSite
              ? `Five most recent reports at ${selectedSite.name}.`
              : "Five most recent reports across your accessible sites."
            : "Recent reports follow the site scope."
        }
        action={enabled ? <Badge tone="neutral">Latest 5</Badge> : undefined}
      />

      <CardBody>
        {!enabled ? (
          <div className="flex items-start gap-3 rounded-lg border border-navy-100 bg-navy-50/60 px-4 py-3">
            <InfoIcon size={18} className="mt-0.5 shrink-0 text-navy-600" />
            <p className="text-sm leading-6 text-navy-800">
              A project-only scope cannot filter the incident feed, because the
              API supports site scoping rather than project scoping. Select a
              site to see its five most recent reports, or clear the project
              filter to see reports across your accessible sites.
            </p>
          </div>
        ) : reports.isLoading ? (
          <Spinner label="Loading latest reports..." />
        ) : reports.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          >
            <p className="text-sm font-medium text-red-700">
              Unable to load the latest reports.
            </p>
            <p className="mt-1 text-sm leading-6 text-red-700/90">
              {reports.error instanceof Error
                ? reports.error.message
                : "Please try again."}
            </p>
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void reports.refetch()}
              >
                <RefreshIcon size={14} />
                Try again
              </Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm leading-6 text-muted">
            No reports in this scope yet. New incident and near-miss reports
            will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((incident) => (
              <li key={incident.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TYPE_TONES[incident.type]} dot>
                    {formatHseLabel(incident.type)}
                  </Badge>
                  <Badge tone={STATUS_TONES[incident.status]}>
                    {formatHseLabel(incident.status)}
                  </Badge>
                  {incident.category && (
                    <span className="text-xs text-muted">
                      {formatHseLabel(incident.category)}
                    </span>
                  )}
                </div>

                <p className="mt-2 line-clamp-2 text-sm font-medium text-ink">
                  {incident.title}
                </p>

                <p className="mt-1 text-xs text-muted">
                  {siteNames.get(incident.site.id) ?? "Unknown site"}
                  <span aria-hidden="true"> · </span>
                  {formatUtcDate(incident.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
