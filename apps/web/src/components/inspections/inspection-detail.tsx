"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { useInspection } from "@/lib/api/inspections";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ArrowLeftIcon } from "@/components/icons";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  isInspectionOverdue,
} from "@/lib/inspections";
import {
  canEditInspection,
  canUploadInspectionEvidence,
} from "@/lib/permissions";
import {
  InspectionOverdueBadge,
  InspectionStatusBadge,
  InspectionTypeBadge,
} from "./inspection-badges";
import { InspectionEditPanel } from "./inspection-edit-panel";
import { InspectionFindingsPanel } from "./inspection-findings-panel";
import { InspectionStatusPanel } from "./inspection-status-panel";

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

/**
 * Inspection detail. Workflow, findings and metadata controls are gated by
 * client mirrors of the server rules; the API remains authoritative for every
 * transition, finding and corrective action link.
 */
export function InspectionDetail({ inspectionId }: { inspectionId: string }) {
  const inspectionQuery = useInspection(inspectionId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const inspection = inspectionQuery.data?.inspection;
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;

  const backLink = (
    <Link
      href="/inspections"
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      Back to inspections
    </Link>
  );

  if (inspectionQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading inspection..." />
      </div>
    );
  }

  if (inspectionQuery.isError || !inspection) {
    const notFound =
      inspectionQuery.error instanceof ApiError &&
      inspectionQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={notFound ? "Inspection not found" : "Unable to load inspection"}
          message={
            notFound
              ? "This inspection does not exist or is outside your site scope."
              : inspectionQuery.error instanceof Error
                ? inspectionQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link
                href="/inspections"
                className={buttonStyles("secondary")}
              >
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void inspectionQuery.refetch()}
                isLoading={inspectionQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const canEdit = canEditInspection(role, inspection);
  const canUpload = canUploadInspectionEvidence(role, viewerId, inspection);
  const overdue = isInspectionOverdue(inspection);

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <InspectionStatusBadge status={inspection.status} />
          <InspectionTypeBadge type={inspection.type} />
          {overdue && <InspectionOverdueBadge />}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {inspection.title}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              Scheduled {formatUtcDateTime(inspection.scheduledFor)}
              <span aria-hidden="true"> · </span>
              {inspection.site?.name ?? inspection.project.name}
              <span aria-hidden="true"> · </span>
              {personName(inspection.inspector)}
            </p>
          </div>

          {canEdit && (
            <Button
              variant="secondary"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Cancel editing" : "Edit schedule"}
            </Button>
          )}
        </div>
      </header>

      {editing && canEdit && (
        <InspectionEditPanel
          inspection={inspection}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {inspection.description && (
            <Card>
              <CardHeader
                title="Scope"
                description="What this inspection covers."
              />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {inspection.description}
                </p>
              </CardBody>
            </Card>
          )}

          {inspection.status === "COMPLETED" && (
            <Card>
              <CardHeader title="Completion record" />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {inspection.completionNotes ??
                    "No completion notes have been recorded."}
                </p>
                {inspection.completedAt && (
                  <p className="mt-2 text-xs text-muted">
                    {inspection.completedBy
                      ? personName(inspection.completedBy)
                      : "Unknown employee"}{" "}
                    · {formatUtcDateTime(inspection.completedAt)}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          <InspectionFindingsPanel
            inspection={inspection}
            role={role}
            viewerId={viewerId}
          />

          <AttachmentsPanel
            key={inspection.id}
            entityType="inspection"
            entityId={inspection.id}
            title="Inspection evidence"
            description="Photographs and documents captured during the inspection. Access is scoped by the API."
            emptyMessage="No evidence has been attached to this inspection yet."
            canUpload={canUpload}
            uploadBlockedMessage={
              inspection.status === "CANCELLED"
                ? "This inspection was cancelled and accepts no new evidence."
                : "Only HSE management, the inspection creator or the assigned inspector can upload evidence."
            }
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Inspection information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField
                  label="Inspector"
                  value={personName(inspection.inspector)}
                />
                <DetailField
                  label="Scheduled for"
                  value={formatUtcDateTime(inspection.scheduledFor)}
                />
                <DetailField
                  label="Project"
                  value={inspection.project.name ?? "—"}
                />
                <DetailField
                  label="Site"
                  value={inspection.site?.name ?? "No specific site"}
                />
                <DetailField
                  label="Findings"
                  value={String(inspection.findings.length)}
                />
                <DetailField
                  label="Created by"
                  value={
                    inspection.createdBy
                      ? personName(inspection.createdBy)
                      : "Unknown employee"
                  }
                />
                <DetailField
                  label="Created"
                  value={formatUtcDateTime(inspection.createdAt)}
                />
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(inspection.updatedAt)}
                />
              </dl>
            </CardBody>
          </Card>

          <InspectionStatusPanel
            inspection={inspection}
            role={role}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  );
}
