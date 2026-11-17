"use client";

import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonStyles, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PlusIcon, RefreshIcon } from "@/components/icons";
import { useIncidents } from "@/lib/api/incidents";
import type {
  IncidentStatus,
  IncidentType,
  SiteSummary,
} from "@/lib/api/types";
import { formatUtcDate, formatUtcDateTime } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { incidentDetailHref } from "@/lib/incident-workflow";

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
 * Personal report tracker. It asks the incident endpoint for `mine=true`, so
 * it remains available after a site reassignment and never exposes another
 * employee's report. Freshness comes from React Query invalidation/refetch.
 */
export function MyReports({ sites }: { sites: readonly SiteSummary[] }) {
  const reports = useIncidents({ mine: true, limit: 5 });
  const siteNames = new Map(sites.map((site) => [site.id, site.name]));
  const items = reports.data?.incidents ?? [];

  return (
    <Card>
      <CardHeader
        title="My reports"
        description="Incidents and near misses you filed, with their latest workflow status."
        action={
          <Badge tone="neutral">
            {reports.isFetching ? "Updating…" : `${items.length} shown`}
          </Badge>
        }
      />

      <CardBody>
        {reports.isLoading ? (
          <Spinner label="Loading your reports..." />
        ) : reports.isError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          >
            <p className="text-sm font-medium text-red-700">
              Unable to load your reports.
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
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm leading-6 text-muted">
              You have not filed an incident or near miss yet. Your reports
              stay visible here even if your site assignment changes.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/incidents/new" className={buttonStyles("primary")}>
                <PlusIcon size={14} />
                Report incident
              </Link>
              <Link
                href="/near-misses/new"
                className={buttonStyles("secondary")}
              >
                Report near miss
              </Link>
            </div>
          </div>
        ) : (
          <>
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
                  </div>

                  <Link
                    href={incidentDetailHref(incident.type, incident.id)}
                    className="mt-2 line-clamp-2 block text-sm font-medium text-ink underline-offset-2 hover:text-navy-700 hover:underline"
                  >
                    {incident.title}
                  </Link>

                  <p className="mt-1 text-xs text-muted">
                    {siteNames.get(incident.site.id) ?? "Unknown site"}
                    <span aria-hidden="true"> · </span>
                    Occurred {formatUtcDate(incident.occurredAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {incident.statusUpdatedAt
                      ? `Last status change ${formatUtcDateTime(
                          incident.statusUpdatedAt,
                        )}`
                      : "No status change recorded yet"}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-line pt-4">
              <Link
                href="/incidents?mine=true"
                className="text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
              >
                View all my reports
              </Link>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
