"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { useCorrectiveAction } from "@/lib/api/corrective-actions";
import type { CorrectiveActionSummary } from "@/lib/api/types";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ArrowLeftIcon } from "@/components/icons";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { formatUtcDate, formatUtcDateTime } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { incidentDetailHref } from "@/lib/incident-workflow";
import { inspectionDetailHref } from "@/lib/inspections";
import {
  isCorrectiveActionOverdue,
  isCorrectiveActionTerminal,
} from "@/lib/corrective-actions";
import {
  canEditCorrectiveAction,
  canUploadCorrectiveActionEvidence,
} from "@/lib/permissions";
import {
  CorrectiveActionSourceBadge,
  CorrectiveActionStatusBadge,
  OverdueBadge,
} from "./corrective-action-badges";
import { CorrectiveActionEditPanel } from "./corrective-action-edit-panel";
import { CorrectiveActionStatusPanel } from "./corrective-action-status-panel";

function personName(person: { firstName: string; lastName: string }): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unknown employee";
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

function incidentHref(action: CorrectiveActionSummary): string | null {
  if (!action.incident) {
    return null;
  }

  if (
    action.incident.type === "INCIDENT" ||
    action.incident.type === "NEAR_MISS"
  ) {
    return incidentDetailHref(action.incident.type, action.incident.id);
  }

  return null;
}

/**
 * Corrective action detail. Workflow controls and metadata editing are gated
 * by client mirrors of the server rules; the API remains authoritative for
 * every transition, reassignment and evidence upload.
 */
export function CorrectiveActionDetail({ actionId }: { actionId: string }) {
  const actionQuery = useCorrectiveAction(actionId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const action = actionQuery.data?.correctiveAction;
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;

  const backLink = (
    <Link
      href="/corrective-actions"
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      Back to corrective actions
    </Link>
  );

  if (actionQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading corrective action..." />
      </div>
    );
  }

  if (actionQuery.isError || !action) {
    const notFound =
      actionQuery.error instanceof ApiError && actionQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={
            notFound ? "Corrective action not found" : "Unable to load action"
          }
          message={
            notFound
              ? "This action does not exist or is outside your site scope."
              : actionQuery.error instanceof Error
                ? actionQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link
                href="/corrective-actions"
                className={buttonStyles("secondary")}
              >
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void actionQuery.refetch()}
                isLoading={actionQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const canEdit = canEditCorrectiveAction(role, action);
  const canUpload = canUploadCorrectiveActionEvidence(role, viewerId, action);
  const incidentLink = incidentHref(action);
  const inspectionLink = action.inspection
    ? inspectionDetailHref(action.inspection.id)
    : null;
  const overdue = isCorrectiveActionOverdue(action);
  const summary =
    action.description.length > 90
      ? `${action.description.slice(0, 90).trimEnd()}…`
      : action.description;

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <CorrectiveActionStatusBadge status={action.status} />
          <CorrectiveActionSourceBadge source={action.source} />
          {overdue && <OverdueBadge />}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {summary}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              Due {formatUtcDate(action.dueDate)}
              <span aria-hidden="true"> · </span>
              {action.site?.name ?? action.project.name}
            </p>
          </div>

          {canEdit && (
            <Button
              variant="secondary"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Cancel editing" : "Edit details"}
            </Button>
          )}
        </div>
      </header>

      {editing && canEdit && (
        <CorrectiveActionEditPanel
          action={action}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Action required"
              description="The outcome this action is expected to deliver."
            />
            <CardBody>
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                {action.description}
              </p>
            </CardBody>
          </Card>

          {(action.completionNotes ||
            action.verificationNotes ||
            isCorrectiveActionTerminal(action.status)) && (
            <Card>
              <CardHeader title="Closure record" />
              <CardBody className="space-y-5">
                <section>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Completion notes
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                    {action.completionNotes ??
                      "No completion notes have been recorded."}
                  </p>
                  {action.completedAt && action.completedBy && (
                    <p className="mt-2 text-xs text-muted">
                      {personName(action.completedBy)} ·{" "}
                      {formatUtcDateTime(action.completedAt)}
                    </p>
                  )}
                </section>

                <section className="border-t border-line pt-5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Verification notes
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                    {action.verificationNotes ??
                      "No verification notes have been recorded."}
                  </p>
                  {action.verifiedAt && action.verifiedBy && (
                    <p className="mt-2 text-xs text-muted">
                      {personName(action.verifiedBy)} ·{" "}
                      {formatUtcDateTime(action.verifiedAt)}
                    </p>
                  )}
                </section>
              </CardBody>
            </Card>
          )}

          <AttachmentsPanel
            key={action.id}
            entityType="corrective_action"
            entityId={action.id}
            title="Evidence attachments"
            description="Photographs and documents supporting completion. Access is scoped by the API."
            emptyMessage="No evidence has been attached to this action yet."
            canUpload={canUpload}
            uploadBlockedMessage={
              action.status === "VERIFIED"
                ? "This action is verified and closed, so it accepts no new evidence."
                : "Only HSE management, the action creator or the assignee can upload evidence."
            }
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Action information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField
                  label="Assignee"
                  value={personName(action.assignedTo)}
                />
                <DetailField
                  label="Due"
                  value={formatUtcDate(action.dueDate)}
                />
                <DetailField
                  label="Project"
                  value={action.project.name ?? "—"}
                />
                <DetailField label="Site" value={action.site?.name ?? "—"} />
                <DetailField
                  label="Source"
                  value={formatHseLabel(action.source)}
                />
                <DetailField
                  label="Linked report"
                  value={
                    action.incident
                      ? (action.incident.title ?? "Linked report unavailable")
                      : "Not linked to a report"
                  }
                />
                {incidentLink && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Open report
                    </dt>
                    <dd className="mt-1">
                      <Link
                        href={incidentLink}
                        className="text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
                      >
                        View linked report
                      </Link>
                    </dd>
                  </div>
                )}
                {inspectionLink && (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Linked inspection
                    </dt>
                    <dd className="mt-1">
                      <Link
                        href={inspectionLink}
                        className="text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
                      >
                        View linked inspection
                      </Link>
                      {action.findingId && (
                        <p className="mt-1 text-xs text-muted">
                          Linked to an inspection finding
                        </p>
                      )}
                    </dd>
                  </div>
                )}
                <DetailField
                  label="Created by"
                  value={
                    action.createdBy
                      ? personName(action.createdBy)
                      : "Unknown employee"
                  }
                />
                <DetailField
                  label="Created"
                  value={formatUtcDateTime(action.createdAt)}
                />
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(action.updatedAt)}
                />
              </dl>
            </CardBody>
          </Card>

          <CorrectiveActionStatusPanel
            action={action}
            role={role}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  );
}
