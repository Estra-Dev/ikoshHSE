"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField } from "@/components/ui/fields";
import { useUpdateRiskAssessmentStatus } from "@/lib/api/risk-assessments";
import type {
  IkoshRole,
  RiskAssessmentStatus,
  RiskAssessmentSummary,
} from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { nextRiskAssessmentStatuses } from "@/lib/risk-assessments";
import {
  canManageRiskAssessments,
  canSubmitRiskAssessment,
} from "@/lib/permissions";

interface RiskAssessmentStatusPanelProps {
  assessment: RiskAssessmentSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}

function actionLabel(status: RiskAssessmentStatus): string {
  switch (status) {
    case "IN_REVIEW":
      return "Submit for review";
    case "APPROVED":
      return "Approve assessment";
    case "DRAFT":
      return "Return to draft";
    case "ARCHIVED":
      return "Archive assessment";
  }
}

/**
 * Workflow controls. Authors submit drafts; only HSE management can approve,
 * return to draft or archive. The API re-checks every transition.
 */
export function RiskAssessmentStatusPanel({
  assessment,
  role,
  viewerId,
}: RiskAssessmentStatusPanelProps) {
  const updateStatus = useUpdateRiskAssessmentStatus();

  const transitions = nextRiskAssessmentStatuses(assessment.status).filter(
    (next) =>
      next === "IN_REVIEW"
        ? canSubmitRiskAssessment(role, viewerId, assessment)
        : canManageRiskAssessments(role),
  );

  const [target, setTarget] = useState<RiskAssessmentStatus | "">(
    transitions[0] ?? "",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // The assessment changes after each mutation, so a previously selected
  // target may no longer be a legal transition.
  const effectiveTarget =
    target !== "" && transitions.includes(target)
      ? target
      : (transitions[0] ?? "");

  async function handleSubmit(): Promise<void> {
    setError("");
    setMessage("");

    if (!effectiveTarget) {
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: assessment.id,
        input: { status: effectiveTarget },
      });
      setMessage(
        `Assessment moved to ${formatHseLabel(effectiveTarget)}.`,
      );
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The status could not be updated.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Workflow"
        description="Drafts are submitted for review, then approved by HSE management. Approved assessments are immutable except for archiving."
      />
      <CardBody className="space-y-4">
        {assessment.status === "ARCHIVED" ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            This assessment is archived and read-only. Create a new assessment
            if the work changes.
          </p>
        ) : interactionsBlocked(assessment, role, viewerId) ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {blockedMessage(assessment, role)}
          </p>
        ) : transitions.length === 0 ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            No workflow action is available to you for this assessment.
          </p>
        ) : (
          <>
            <SelectField
              label="Next status"
              id="risk-next-status"
              value={effectiveTarget}
              onChange={(event) => {
                setTarget(event.target.value as RiskAssessmentStatus);
                setError("");
                setMessage("");
              }}
              options={transitions.map((status) => ({
                value: status,
                label: actionLabel(status),
              }))}
            />

            <Button
              onClick={() => void handleSubmit()}
              isLoading={updateStatus.isPending}
            >
              {actionLabel(effectiveTarget)}
            </Button>

            {message && (
              <p role="status" className="text-sm text-emerald-700">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function interactionsBlocked(
  assessment: RiskAssessmentSummary,
  role: IkoshRole | undefined,
  viewerId: string | undefined,
): boolean {
  if (assessment.status === "APPROVED") {
    return !canManageRiskAssessments(role);
  }

  if (assessment.status === "DRAFT") {
    return !canSubmitRiskAssessment(role, viewerId, assessment);
  }

  return false;
}

function blockedMessage(
  assessment: RiskAssessmentSummary,
  role: IkoshRole | undefined,
): string {
  if (assessment.status === "APPROVED") {
    return "This assessment is approved and can only be archived by HSE management.";
  }

  if (!canManageRiskAssessments(role)) {
    return "Only the assessment owner, creator or HSE management can submit this draft for review.";
  }

  return "No workflow action is available for this assessment.";
}
