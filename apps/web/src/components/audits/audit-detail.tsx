"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useAudit } from "@/lib/api/audits";
import { useMe } from "@/lib/api/employees";
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
import { auditChecklistProgress, isAuditOverdue } from "@/lib/audits";
import {
  canConductAudit,
  canEditAudit,
  canUploadAuditEvidence,
} from "@/lib/permissions";
import {
  AuditOverdueBadge,
  AuditStatusBadge,
  AuditTypeBadge,
} from "./audit-badges";
import { AuditChecklistPanel } from "./audit-checklist-panel";
import { AuditEditPanel } from "./audit-edit-panel";
import { AuditFindingsPanel } from "./audit-findings-panel";
import { AuditStatusPanel } from "./audit-status-panel";

function personName(person: { firstName: string; lastName: string }): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unknown employee";
}

function auditorNames(
  auditors: readonly { firstName: string; lastName: string }[],
): string {
  const names = auditors.map(personName).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Unassigned";
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
 * Audit detail. Workflow, checklist, finding and metadata controls are gated by
 * client mirrors of the server rules; the API remains authoritative for every
 * transition, checklist result, finding and corrective action link.
 */
export function AuditDetail({ auditId }: { auditId: string }) {
  const auditQuery = useAudit(auditId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const audit = auditQuery.data?.audit;
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;

  const backLink = (
    <Link
      href="/audits"
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      Back to audits
    </Link>
  );

  if (auditQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading audit..." />
      </div>
    );
  }

  if (auditQuery.isError || !audit) {
    const notFound =
      auditQuery.error instanceof ApiError &&
      auditQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={notFound ? "Audit not found" : "Unable to load audit"}
          message={
            notFound
              ? "This audit does not exist or is outside your site or auditor scope."
              : auditQuery.error instanceof Error
                ? auditQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link href="/audits" className={buttonStyles("secondary")}>
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void auditQuery.refetch()}
                isLoading={auditQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const canEdit = canEditAudit(role, audit);
  const canConduct = canConductAudit(role, viewerId, audit);
  const canUpload = canUploadAuditEvidence(role, viewerId, audit);
  const overdue = isAuditOverdue(audit);
  const progress = auditChecklistProgress(audit.checklist);

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <AuditStatusBadge status={audit.status} />
          <AuditTypeBadge type={audit.type} />
          {overdue && <AuditOverdueBadge />}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {audit.title}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              Scheduled {formatUtcDateTime(audit.scheduledFor)}
              <span aria-hidden="true"> · </span>
              {audit.site?.name ?? audit.project.name}
              <span aria-hidden="true"> · </span>
              {auditorNames(audit.auditors)}
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
        <AuditEditPanel
          audit={audit}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {audit.description && (
            <Card>
              <CardHeader title="Scope" description="What this audit covers." />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {audit.description}
                </p>
              </CardBody>
            </Card>
          )}

          {audit.status === "COMPLETED" && (
            <Card>
              <CardHeader title="Completion record" />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {audit.completionNotes ??
                    "No completion notes have been recorded."}
                </p>
                {audit.completedAt && (
                  <p className="mt-2 text-xs text-muted">
                    {audit.completedBy
                      ? personName(audit.completedBy)
                      : "Unknown employee"}{" "}
                    · {formatUtcDateTime(audit.completedAt)}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          <AuditChecklistPanel audit={audit} canConduct={canConduct} />

          <AuditFindingsPanel
            audit={audit}
            role={role}
            viewerId={viewerId}
          />

          <AttachmentsPanel
            key={audit.id}
            entityType="hse_audit"
            entityId={audit.id}
            title="Audit evidence"
            description="Documents and photographs captured during the audit. Access is scoped by the API."
            emptyMessage="No evidence has been attached to this audit yet."
            canUpload={canUpload}
            uploadBlockedMessage={
              audit.status === "COMPLETED" || audit.status === "CANCELLED"
                ? "This audit is closed and accepts no new evidence."
                : "Only HSE management, the audit creator or an assigned auditor can upload evidence."
            }
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Audit information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField
                  label="Auditors"
                  value={auditorNames(audit.auditors)}
                />
                <DetailField
                  label="Scheduled for"
                  value={formatUtcDateTime(audit.scheduledFor)}
                />
                <DetailField
                  label="Project"
                  value={audit.project.name ?? "—"}
                />
                <DetailField
                  label="Site"
                  value={audit.site?.name ?? "No specific site"}
                />
                <DetailField
                  label="Checklist assessed"
                  value={
                    progress.total === 0
                      ? "No questions"
                      : `${progress.assessed} of ${progress.total}`
                  }
                />
                <DetailField
                  label="Findings"
                  value={String(audit.findings.length)}
                />
                <DetailField
                  label="Created by"
                  value={
                    audit.createdBy
                      ? personName(audit.createdBy)
                      : "Unknown employee"
                  }
                />
                <DetailField
                  label="Created"
                  value={formatUtcDateTime(audit.createdAt)}
                />
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(audit.updatedAt)}
                />
              </dl>
              <Link
                href={`/audit-log?entityType=HseAudit&entityId=${audit.id}`}
                className="mt-4 inline-block text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
              >
                View audit history
              </Link>
            </CardBody>
          </Card>

          <AuditStatusPanel
            audit={audit}
            role={role}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  );
}
