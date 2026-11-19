"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { usePermit } from "@/lib/api/permits";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ArrowLeftIcon } from "@/components/icons";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { RiskAssessmentStatusBadge } from "@/components/risk-assessments/risk-assessment-badges";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { isPermitExpired } from "@/lib/permits";
import {
  riskAssessmentDetailHref,
  riskAssessmentRevisionLabel,
} from "@/lib/risk-assessments";
import {
  canEditPermit,
  canUploadPermitEvidence,
} from "@/lib/permissions";
import {
  PermitExpiredBadge,
  PermitRiskAssessmentStateBadge,
  PermitStatusBadge,
  PermitWorkTypeBadge,
} from "./permit-badges";
import { PermitForm } from "./permit-form";
import { PermitStatusPanel } from "./permit-status-panel";

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

function WorkflowEvent({
  label,
  actor,
  at,
}: {
  label: string;
  actor: { firstName: string; lastName: string } | null;
  at: string | null;
}) {
  if (!at) {
    return null;
  }

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <span className="text-sm text-ink">{label}</span>
      <span className="text-xs text-muted">
        {actor ? personName(actor) : "Unknown employee"} ·{" "}
        {formatUtcDateTime(at)}
      </span>
    </li>
  );
}

/**
 * Permit detail. Workflow controls, editing and evidence upload are gated by
 * client mirrors of the server rules; the API remains authoritative for every
 * transition, validity-window check and approval.
 */
export function PermitDetail({ permitId }: { permitId: string }) {
  const permitQuery = usePermit(permitId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const permit = permitQuery.data?.permit;
  const employee = me.data?.employee;
  const role = employee?.ikoshRole;
  const viewerId = employee?.id;

  const backLink = (
    <Link
      href="/permits"
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      Back to permits
    </Link>
  );

  if (permitQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading permit..." />
      </div>
    );
  }

  if (permitQuery.isError || !permit) {
    const notFound =
      permitQuery.error instanceof ApiError &&
      permitQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={notFound ? "Permit not found" : "Unable to load permit"}
          message={
            notFound
              ? "This permit does not exist or is outside your site scope."
              : permitQuery.error instanceof Error
                ? permitQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link href="/permits" className={buttonStyles("secondary")}>
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void permitQuery.refetch()}
                isLoading={permitQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const expired = isPermitExpired(permit);
  const canEdit = canEditPermit(role, viewerId, permit);
  const canUpload = canUploadPermitEvidence(role, viewerId, permit);

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <PermitStatusBadge status={permit.status} />
          <PermitWorkTypeBadge workType={permit.workType} />
          {expired && <PermitExpiredBadge />}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {permit.workDescription}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              {permit.site.name ?? "Unknown site"}
              {permit.site.code ? ` · ${permit.site.code}` : ""}
              <span aria-hidden="true"> · </span>
              {permit.project.name ?? "Unknown project"}
              {permit.location ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {permit.location}
                </>
              ) : null}
            </p>
          </div>

          {editing ? (
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel editing
            </Button>
          ) : (
            canEdit && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit draft
              </Button>
            )
          )}
        </div>
      </header>

      {expired && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          This permit expired on {formatUtcDateTime(permit.validTo)}. It cannot
          be activated or resumed. {permit.status === "ACTIVE" ||
          permit.status === "SUSPENDED"
            ? "Close it to record the final handover."
            : "Raise a new permit before any further work."}
        </p>
      )}

      {editing && canEdit && (
        <PermitForm
          permit={permit}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Work scope"
              description="What is authorised, where and for how long."
            />
            <CardBody>
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                {permit.workDescription}
              </p>

              <dl className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                <DetailField
                  label="Validity starts"
                  value={formatUtcDateTime(permit.validFrom)}
                />
                <DetailField
                  label="Validity ends"
                  value={formatUtcDateTime(permit.validTo)}
                />
                <DetailField
                  label="Project"
                  value={permit.project.name ?? "—"}
                />
                <DetailField
                  label="Site"
                  value={permit.site.name ?? "Unknown site"}
                />
                <DetailField
                  label="Location"
                  value={permit.location || "Not specified"}
                />
                <DetailField
                  label="Responsible person"
                  value={
                    permit.responsiblePerson
                      ? personName(permit.responsiblePerson)
                      : "Unassigned"
                  }
                />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Workers involved"
              description="People covered by this permit. They do not receive system access through it."
              action={<Badge tone="neutral">{permit.workersInvolved.length}</Badge>}
            />
            <CardBody>
              {permit.workersInvolved.length === 0 ? (
                <p className="text-sm text-muted">No workers recorded.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {permit.workersInvolved.map((worker, index) => (
                    <li
                      key={`${worker}-${index}`}
                      className="rounded-lg border border-line bg-navy-50/30 px-3 py-2 text-sm text-ink"
                    >
                      {worker}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Required precautions"
              description="Controls that must be in place before and during the work."
              action={
                <Badge tone="neutral">
                  {permit.requiredPrecautions.length}
                </Badge>
              }
            />
            <CardBody>
              {permit.requiredPrecautions.length === 0 ? (
                <p className="text-sm text-muted">No precautions recorded.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {permit.requiredPrecautions.map((precaution) => (
                    <Badge key={precaution} tone="blue">
                      {formatHseLabel(precaution)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Hazard identification and controls"
              description="Identified hazards and the measures that make the job safe."
              action={<Badge tone="neutral">{permit.hazards.length}</Badge>}
            />
            <CardBody>
              {permit.hazards.length === 0 ? (
                <p className="text-sm text-muted">No hazards recorded.</p>
              ) : (
                <ol className="space-y-4">
                  {permit.hazards.map((hazard, index) => (
                    <li
                      key={hazard.id}
                      className="rounded-lg border border-line bg-navy-50/30 p-4"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Hazard {index + 1}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-ink">
                        {hazard.hazard}
                      </p>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Control measures
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                        {hazard.controlMeasures}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Linked risk assessments"
              description="Risk assessments linked to this permit. Historical links remain visible after a newer revision is approved."
              action={
                <Badge tone="neutral">
                  {permit.linkedRiskAssessments.length}
                </Badge>
              }
            />
            <CardBody>
              {permit.linkedRiskAssessments.length === 0 ? (
                <p className="text-sm text-muted">
                  No risk assessments linked to this permit.
                </p>
              ) : (
                <ul className="space-y-2">
                  {permit.linkedRiskAssessments.map((assessment) => (
                    <li
                      key={assessment.id}
                      className="rounded-lg border border-line bg-navy-50/30 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={riskAssessmentDetailHref(assessment.id)}
                          className="text-sm font-medium text-navy-700 transition hover:text-navy-900"
                        >
                          {assessment.title || "Untitled risk assessment"}
                        </Link>
                        <div className="flex flex-wrap items-center gap-2">
                          {assessment.status ? (
                            <RiskAssessmentStatusBadge
                              status={assessment.status}
                            />
                          ) : (
                            <Badge tone="neutral">Unknown status</Badge>
                          )}
                          <PermitRiskAssessmentStateBadge
                            isCurrent={assessment.isCurrent}
                            status={assessment.status}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {riskAssessmentRevisionLabel(assessment.revision)}
                        {assessment.site?.name
                          ? ` · ${assessment.site.name}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Workflow trail"
              description="Submission, approval and close-out actions recorded for this permit."
            />
            <CardBody>
              <ul className="divide-y divide-line">
                <WorkflowEvent
                  label="Submitted"
                  actor={permit.submittedBy}
                  at={permit.submittedAt}
                />
                <WorkflowEvent
                  label="Approved"
                  actor={permit.approvedBy}
                  at={permit.approvedAt}
                />
                <WorkflowEvent
                  label="Rejected"
                  actor={permit.rejectedBy}
                  at={permit.rejectedAt}
                />
                <WorkflowEvent
                  label="Activated"
                  actor={permit.activatedBy}
                  at={permit.activatedAt}
                />
                <WorkflowEvent
                  label="Suspended"
                  actor={permit.suspendedBy}
                  at={permit.suspendedAt}
                />
                <WorkflowEvent
                  label="Resumed"
                  actor={permit.resumedBy}
                  at={permit.resumedAt}
                />
                <WorkflowEvent
                  label="Cancelled"
                  actor={permit.cancelledBy}
                  at={permit.cancelledAt}
                />
                <WorkflowEvent
                  label="Closed"
                  actor={permit.closedBy}
                  at={permit.closedAt}
                />
              </ul>

              {!permit.submittedAt &&
                !permit.approvedAt &&
                !permit.activatedAt &&
                !permit.cancelledAt &&
                !permit.closedAt &&
                !permit.rejectedAt && (
                  <p className="text-sm text-muted">
                    No workflow actions have been recorded yet.
                  </p>
                )}

              {permit.rejectionReason && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
                    Rejection reason
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-800">
                    {permit.rejectionReason}
                  </p>
                </div>
              )}

              {permit.suspensionReason && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                    Suspension reason
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-amber-800">
                    {permit.suspensionReason}
                  </p>
                </div>
              )}

              {permit.cancellationReason && (
                <div className="mt-4 rounded-lg border border-line bg-navy-50/40 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Cancellation reason
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
                    {permit.cancellationReason}
                  </p>
                </div>
              )}

              {permit.closureChecks && (
                <div className="mt-4 rounded-lg border border-line bg-navy-50/40 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Close-out checks
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-ink">
                    <li>
                      {permit.closureChecks.workAreaSecured ? "✓" : "✗"} Work
                      area secured
                    </li>
                    <li>
                      {permit.closureChecks.personnelAccountedFor ? "✓" : "✗"}{" "}
                      All personnel accounted for
                    </li>
                    <li>
                      {permit.closureChecks.equipmentIsolated ? "✓" : "✗"}{" "}
                      Equipment isolated and made safe
                    </li>
                    <li>
                      {permit.closureChecks.siteHandoverCompleted ? "✓" : "✗"}{" "}
                      Site handover completed
                    </li>
                  </ul>
                  {permit.closureNotes && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                      {permit.closureNotes}
                    </p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <AttachmentsPanel
            key={permit.id}
            entityType="permit"
            entityId={permit.id}
            title="Permit evidence"
            description="Supporting documents such as gas test records, isolation certificates and signed handovers. Access is scoped by the API."
            emptyMessage="No evidence has been attached to this permit yet."
            canUpload={canUpload}
            uploadBlockedMessage={
              permit.status === "CLOSED" ||
              permit.status === "REJECTED" ||
              permit.status === "CANCELLED"
                ? "This permit is closed, rejected or cancelled and accepts no new evidence."
                : "Only HSE management, the permit creator or the responsible person can upload evidence."
            }
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Permit information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField
                  label="Status"
                  value={formatHseLabel(permit.status)}
                />
                <DetailField
                  label="Work type"
                  value={formatHseLabel(permit.workType)}
                />
                <DetailField
                  label="Created by"
                  value={
                    permit.createdBy
                      ? personName(permit.createdBy)
                      : "Unknown employee"
                  }
                />
                <DetailField
                  label="Created"
                  value={formatUtcDateTime(permit.createdAt)}
                />
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(permit.updatedAt)}
                />
              </dl>
            </CardBody>
          </Card>

          <PermitStatusPanel
            permit={permit}
            role={role}
            viewerId={viewerId}
            assignedSites={employee?.assignedSites ?? []}
          />
        </div>
      </div>
    </div>
  );
}
