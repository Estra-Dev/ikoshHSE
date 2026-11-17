"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { useIncident } from "@/lib/api/incidents";
import { useSites } from "@/lib/api/worksites";
import type { IncidentType } from "@/lib/api/types";
import { Button, buttonStyles, EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ArrowLeftIcon } from "@/components/icons";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  canCreateCorrectiveActions,
  canEditIncidentReport,
  canManageIncidentWorkflow,
} from "@/lib/permissions";
import { incidentDetailHref } from "@/lib/incident-workflow";
import {
  IncidentCategoryBadge,
  IncidentStatusBadge,
  IncidentTypeBadge,
} from "./incident-badges";
import { IncidentAttachments } from "./incident-attachments";
import { IncidentClassificationPanel } from "./incident-classification-panel";
import { IncidentReportForm } from "./incident-report-form";
import { IncidentStatusPanel } from "./incident-status-panel";

function actorLabel(
  id: string | null | undefined,
  viewerId: string | undefined,
): string {
  if (!id) {
    return "Not disclosed";
  }

  return viewerId && id === viewerId ? "You" : "Another IKOSH employee";
}

function TimelineEntry({
  label,
  value,
  done,
}: {
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
          done ? "bg-emerald-500" : "bg-navy-200"
        }`}
      />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-ink">{value}</p>
      </div>
    </li>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

/**
 * Shared incident/near-miss detail view. Reporters see an edit control only
 * while their own report is still REPORTED; management sees classification
 * and workflow controls. The API remains authoritative for every action.
 */
export function IncidentDetail({
  incidentId,
  expectedType,
  backHref,
  backLabel,
}: {
  incidentId: string;
  expectedType?: IncidentType;
  backHref: string;
  backLabel: string;
}) {
  const incidentQuery = useIncident(incidentId);
  const me = useMe();
  const sites = useSites();
  const [editing, setEditing] = useState(false);

  const incident = incidentQuery.data?.incident;
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;
  const canManage = canManageIncidentWorkflow(role);
  const canEdit = incident
    ? canEditIncidentReport(role, viewerId, incident)
    : false;
  const canRaiseCorrectiveAction = canCreateCorrectiveActions(role);
  const siteNames = new Map(sites.data?.sites.map((site) => [site.id, site.name]));

  const backLink = (
    <Link
      href={backHref}
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      {backLabel}
    </Link>
  );

  if (incidentQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading report..." />
      </div>
    );
  }

  if (incidentQuery.isError || !incident) {
    const notFound =
      incidentQuery.error instanceof ApiError &&
      incidentQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={notFound ? "Report not found" : "Unable to load report"}
          message={
            notFound
              ? "This report does not exist or is outside your site scope."
              : incidentQuery.error instanceof Error
                ? incidentQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link href={backHref} className={buttonStyles("secondary")}>
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void incidentQuery.refetch()}
                isLoading={incidentQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  if (expectedType && incident.type !== expectedType) {
    const actualLabel = formatHseLabel(incident.type).toLowerCase();
    const article = actualLabel === "incident" ? "an" : "a";

    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          title={`This report is recorded as ${article} ${actualLabel}`}
          description={`The near-miss register only opens near-miss reports. This report is filed as ${article} ${actualLabel}.`}
          action={
            <Link
              href={incidentDetailHref(incident.type, incident.id)}
              className={buttonStyles("primary")}
            >
              Open {actualLabel} report
            </Link>
          }
        />
      </div>
    );
  }

  const siteName =
    siteNames.get(incident.site.id) ?? "Site details unavailable";
  const occurredLabel = formatUtcDateTime(incident.occurredAt);
  // A withheld reporter means the API returned a privacy-safe colleague view.
  const isFullReport = incident.reportedBy !== null;

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <IncidentTypeBadge type={incident.type} />
          <IncidentStatusBadge status={incident.status} />
          {incident.category && (
            <IncidentCategoryBadge category={incident.category} />
          )}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {incident.title}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              Occurred {occurredLabel}
              <span aria-hidden="true"> · </span>
              {siteName}
            </p>
          </div>

          {(canRaiseCorrectiveAction || canEdit) && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {canRaiseCorrectiveAction && (
                <Link
                  href={`/corrective-actions/new?source=${incident.type}&incidentId=${incident.id}`}
                  className={buttonStyles("secondary")}
                >
                  Raise corrective action
                </Link>
              )}
              {canEdit && (
                <Button
                  variant="secondary"
                  onClick={() => setEditing((current) => !current)}
                >
                  {editing ? "Cancel editing" : "Edit report"}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      {editing && canEdit && (
        <IncidentReportForm
          mode="edit"
          incident={incident}
          siteName={siteName}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Reported details"
              description="Observational facts supplied by the reporter."
            />
            <CardBody className="space-y-5">
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Description
                </h2>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {incident.description}
                </p>
              </section>

              <section className="border-t border-line pt-5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Immediate actions
                </h2>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {isFullReport
                    ? (incident.immediateActions ??
                      "No immediate actions were recorded.")
                    : "Immediate actions are withheld for another employee's report."}
                </p>
              </section>
            </CardBody>
          </Card>

          <IncidentAttachments key={incident.id} incidentId={incident.id} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Report information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField label="Site" value={siteName} />
                <DetailField label="Occurred" value={occurredLabel} />
                <DetailField label="Location" value={incident.location ?? "—"} />
                <DetailField
                  label="Reported by"
                  value={
                    incident.reportedBy
                      ? actorLabel(incident.reportedBy.id, viewerId)
                      : "Withheld"
                  }
                />
                <DetailField
                  label="Reported at"
                  value={formatUtcDateTime(incident.createdAt)}
                />
                <DetailField
                  label="Classification"
                  value={
                    incident.category
                      ? formatHseLabel(incident.category)
                      : "Unclassified"
                  }
                />
                {incident.classifiedAt && (
                  <DetailField
                    label="Classified"
                    value={formatUtcDateTime(incident.classifiedAt)}
                  />
                )}
                {incident.classifiedBy && (
                  <DetailField
                    label="Classified by"
                    value={actorLabel(incident.classifiedBy.id, viewerId)}
                  />
                )}
                {incident.statusUpdatedAt && (
                  <DetailField
                    label="Status updated"
                    value={formatUtcDateTime(incident.statusUpdatedAt)}
                  />
                )}
                {incident.statusUpdatedBy && (
                  <DetailField
                    label="Status updated by"
                    value={actorLabel(incident.statusUpdatedBy.id, viewerId)}
                  />
                )}
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(incident.updatedAt)}
                />
              </dl>

              {!isFullReport && (
                <p className="mt-5 rounded-lg border border-line bg-navy-50/50 px-4 py-3 text-xs leading-5 text-muted">
                  This is another employee&apos;s report. Reporter identity,
                  workflow actors and immediate actions are withheld for
                  privacy; the safety facts are shown so the event can be
                  learned from.
                </p>
              )}

              {isFullReport && !canEdit && incident.status !== "REPORTED" && (
                <p className="mt-5 rounded-lg border border-line bg-navy-50/50 px-4 py-3 text-xs leading-5 text-muted">
                  Reporter editing is available only while a report is in
                  REPORTED status. HSE management can still correct the record.
                </p>
              )}
            </CardBody>
          </Card>

          {isFullReport && (
            <Card>
              <CardHeader
                title="Report timeline"
                description="Follow the report as HSE management triages and closes it."
              />
              <CardBody>
                <ol className="space-y-3 text-sm">
                  <TimelineEntry
                    label="Occurred"
                    value={formatUtcDateTime(incident.occurredAt)}
                    done
                  />
                  <TimelineEntry
                    label="Reported"
                    value={formatUtcDateTime(incident.createdAt)}
                    done
                  />
                  <TimelineEntry
                    label="Classified"
                    value={
                      incident.classifiedAt
                        ? formatUtcDateTime(incident.classifiedAt)
                        : "Awaiting HSE classification"
                    }
                    done={Boolean(incident.classifiedAt)}
                  />
                  <TimelineEntry
                    label="Last status change"
                    value={
                      incident.statusUpdatedAt
                        ? `${formatHseLabel(incident.status)} · ${formatUtcDateTime(
                            incident.statusUpdatedAt,
                          )}`
                        : `${formatHseLabel(incident.status)} · No change recorded`
                    }
                    done={Boolean(incident.statusUpdatedAt)}
                  />
                </ol>
              </CardBody>
            </Card>
          )}

          {canManage && <IncidentClassificationPanel incident={incident} />}
          {canManage && <IncidentStatusPanel incident={incident} />}
        </div>
      </div>
    </div>
  );
}
