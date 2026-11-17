"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { useRiskAssessment } from "@/lib/api/risk-assessments";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ArrowLeftIcon } from "@/components/icons";
import { formatUtcDate, formatUtcDateTime } from "@/lib/dashboard-format";
import type { RiskAssessmentHazard } from "@/lib/api/types";
import {
  riskAssessmentLevelSummary,
  riskScore,
} from "@/lib/risk-assessments";
import { canEditRiskAssessment } from "@/lib/permissions";
import {
  RiskAssessmentStatusBadge,
  RiskLevelBadge,
} from "./risk-assessment-badges";
import { RiskAssessmentForm } from "./risk-assessment-form";
import { RiskAssessmentStatusPanel } from "./risk-assessment-status-panel";

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

function HazardCard({
  hazard,
  index,
}: {
  hazard: RiskAssessmentHazard;
  index: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Hazard {index + 1}
          </p>
          <h3 className="mt-1 break-words text-sm font-semibold text-ink">
            {hazard.hazard}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Inherent
          </span>
          <RiskLevelBadge level={hazard.inherentLevel} />
          <span className="text-xs text-muted">
            {riskScore(hazard.likelihood, hazard.severity)}
          </span>
          <span aria-hidden="true" className="text-muted">
            →
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Residual
          </span>
          <RiskLevelBadge level={hazard.residualLevel} />
          <span className="text-xs text-muted">
            {riskScore(hazard.residualLikelihood, hazard.residualSeverity)}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailField
          label="Potential consequences"
          value={hazard.consequences || "Not recorded"}
        />
        <DetailField
          label="Existing controls"
          value={hazard.existingControls || "Not recorded"}
        />
        <div className="sm:col-span-2">
          <DetailField
            label="Additional controls"
            value={hazard.additionalControls || "Not recorded"}
          />
        </div>
      </dl>
    </div>
  );
}

/**
 * Risk assessment detail. Authoring controls are gated by client mirrors of
 * the server rules; the API remains authoritative for every edit and
 * transition.
 */
export function RiskAssessmentDetail({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const assessmentQuery = useRiskAssessment(assessmentId);
  const me = useMe();
  const [editing, setEditing] = useState(false);

  const assessment = assessmentQuery.data?.riskAssessment;
  const role = me.data?.employee.ikoshRole;
  const viewerId = me.data?.employee.id;

  const backLink = (
    <Link
      href="/risk-assessments"
      className="inline-flex items-center gap-2 text-sm font-medium text-navy-700 transition hover:text-navy-900"
    >
      <ArrowLeftIcon size={16} />
      Back to risk assessments
    </Link>
  );

  if (assessmentQuery.isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <Spinner label="Loading risk assessment..." />
      </div>
    );
  }

  if (assessmentQuery.isError || !assessment) {
    const notFound =
      assessmentQuery.error instanceof ApiError &&
      assessmentQuery.error.status === 404;

    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title={
            notFound
              ? "Risk assessment not found"
              : "Unable to load risk assessment"
          }
          message={
            notFound
              ? "This assessment does not exist or is outside your site scope."
              : assessmentQuery.error instanceof Error
                ? assessmentQuery.error.message
                : "Please try again."
          }
          action={
            notFound ? (
              <Link
                href="/risk-assessments"
                className={buttonStyles("secondary")}
              >
                Back to register
              </Link>
            ) : (
              <Button
                onClick={() => void assessmentQuery.refetch()}
                isLoading={assessmentQuery.isFetching}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const canEdit = canEditRiskAssessment(role, viewerId, assessment);
  const levels = riskAssessmentLevelSummary(assessment.hazards);

  return (
    <div className="space-y-6">
      {backLink}

      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <RiskAssessmentStatusBadge status={assessment.status} />
          {levels.inherent && <RiskLevelBadge level={levels.inherent} />}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              {assessment.title}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted">
              {assessment.project.name ?? "Unknown project"}
              <span aria-hidden="true"> · </span>
              {assessment.site?.name ?? "No specific site"}
              <span aria-hidden="true"> · </span>
              {assessment.owner ? personName(assessment.owner) : "Unassigned"}
            </p>
          </div>

          {canEdit && !editing && (
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              Edit draft
            </Button>
          )}
        </div>
      </header>

      {editing && canEdit && (
        <RiskAssessmentForm
          key={`${assessment.id}-${assessment.updatedAt}`}
          mode="edit"
          assessment={assessment}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {assessment.description && (
            <Card>
              <CardHeader
                title="Scope"
                description="What this assessment covers."
              />
              <CardBody>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink">
                  {assessment.description}
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Hazards and controls"
              description="Inherent risk reflects the task before additional controls; residual risk reflects the expected protection."
              action={
                <span className="text-sm text-muted">
                  {assessment.hazards.length} hazard
                  {assessment.hazards.length === 1 ? "" : "s"}
                </span>
              }
            />
            <CardBody className="space-y-4">
              {assessment.hazards.length === 0 ? (
                <p className="text-sm text-muted">
                  No hazards have been recorded for this assessment.
                </p>
              ) : (
                assessment.hazards.map((hazard, index) => (
                  <HazardCard
                    key={hazard.id}
                    hazard={hazard}
                    index={index}
                  />
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Assessment information" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <DetailField
                  label="Owner"
                  value={
                    assessment.owner
                      ? personName(assessment.owner)
                      : "Unassigned"
                  }
                />
                <DetailField
                  label="Project"
                  value={assessment.project.name ?? "—"}
                />
                <DetailField
                  label="Site"
                  value={assessment.site?.name ?? "No specific site"}
                />
                <DetailField
                  label="Review date"
                  value={
                    assessment.reviewDate
                      ? formatUtcDate(assessment.reviewDate)
                      : "Not set"
                  }
                />
                <DetailField
                  label="Highest inherent"
                  value={levels.inherent ?? "—"}
                />
                <DetailField
                  label="Highest residual"
                  value={levels.residual ?? "—"}
                />
                <DetailField
                  label="Created by"
                  value={
                    assessment.createdBy
                      ? personName(assessment.createdBy)
                      : "Unknown employee"
                  }
                />
                <DetailField
                  label="Created"
                  value={formatUtcDateTime(assessment.createdAt)}
                />
                <DetailField
                  label="Last updated"
                  value={formatUtcDateTime(assessment.updatedAt)}
                />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Approval trail"
              description="Who submitted, approved or archived this assessment."
            />
            <CardBody>
              <ol className="space-y-3 text-sm">
                <TrailEntry
                  label="Submitted for review"
                  person={assessment.submittedBy}
                  at={assessment.submittedAt}
                />
                <TrailEntry
                  label="Approved"
                  person={assessment.approvedBy}
                  at={assessment.approvedAt}
                />
                <TrailEntry
                  label="Archived"
                  person={assessment.archivedBy}
                  at={assessment.archivedAt}
                />
              </ol>
              <Link
                href={`/audit-log?entityType=RiskAssessment&entityId=${assessment.id}`}
                className="mt-4 inline-block text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
              >
                View audit history
              </Link>
            </CardBody>
          </Card>

          <RiskAssessmentStatusPanel
            assessment={assessment}
            role={role}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  );
}

function TrailEntry({
  label,
  person,
  at,
}: {
  label: string;
  person: { firstName: string; lastName: string } | null;
  at: string | null;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
          at ? "bg-emerald-500" : "bg-navy-200"
        }`}
      />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-ink">
          {at && person
            ? `${personName(person)} · ${formatUtcDateTime(at)}`
            : at
              ? formatUtcDateTime(at)
              : "Not yet"}
        </p>
      </div>
    </li>
  );
}
