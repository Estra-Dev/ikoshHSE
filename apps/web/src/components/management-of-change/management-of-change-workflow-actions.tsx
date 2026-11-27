"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import type { IkoshRole } from "@/lib/api/types";
import {
  useApproveManagementOfChangeManagement,
  useApproveManagementOfChangeTechnical,
  useSubmitManagementOfChange,
  type ManagementOfChangeApprovalInput,
  type ManagementOfChangeApprovalPolicy,
  type ManagementOfChangeDetail,
} from "@/lib/api/management-of-change";
import {
  canApproveManagementOfChangeManagement,
  canApproveManagementOfChangeTechnical,
  canSubmitManagementOfChange,
} from "@/lib/permissions";

type ApprovalStage = "technical" | "management";

function approvalFor(
  item: ManagementOfChangeDetail,
  approvalType: "TECHNICAL" | "MANAGEMENT",
) {
  return item.approvals.find(
    (approval) => approval.approvalType === approvalType,
  );
}

function isOwnChange(
  item: ManagementOfChangeDetail,
  viewerId: string | undefined,
): boolean {
  if (!viewerId) return true;

  return [item.changeOwner?.id, item.createdBy?.id, item.submittedBy?.id].some(
    (id) => id === viewerId,
  );
}

export function ManagementOfChangeWorkflowActions({
  item,
  role,
  viewerId,
  approvalPolicy,
}: {
  item: ManagementOfChangeDetail;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
  approvalPolicy: ManagementOfChangeApprovalPolicy | undefined;
}) {
  const submitMutation = useSubmitManagementOfChange();
  const technicalMutation = useApproveManagementOfChangeTechnical();
  const managementMutation = useApproveManagementOfChangeManagement();
  const [technicalComments, setTechnicalComments] = useState("");
  const [managementComments, setManagementComments] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const technical = approvalFor(item, "TECHNICAL");
  const management = approvalFor(item, "MANAGEMENT");
  const selfApprovalBlocked = isOwnChange(item, viewerId);

  const canSubmit =
    Boolean(approvalPolicy?.submissionAllowed) &&
    canSubmitManagementOfChange(role) &&
    item.status === "ASSESSMENT";

  const canTechnical =
    Boolean(approvalPolicy?.approvalAllowed) &&
    canApproveManagementOfChangeTechnical(role) &&
    item.status === "PENDING_APPROVAL" &&
    !selfApprovalBlocked &&
    !technical;

  const canManagement =
    Boolean(approvalPolicy?.approvalAllowed) &&
    canApproveManagementOfChangeManagement(role) &&
    item.status === "PENDING_APPROVAL" &&
    !selfApprovalBlocked &&
    !management &&
    technical?.decision === "APPROVED";

  if (!canSubmit && !canTechnical && !canManagement) {
    return null;
  }

  async function handleSubmit() {
    setError("");
    setSuccess("");

    try {
      await submitMutation.mutateAsync(item.id);
      setSuccess("Change request submitted for two-stage approval.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to submit the change request.",
      );
    }
  }

  async function handleDecision(
    stage: ApprovalStage,
    decision: ManagementOfChangeApprovalInput["decision"],
  ) {
    setError("");
    setSuccess("");

    const comments =
      stage === "technical" ? technicalComments : managementComments;

    try {
      const input: ManagementOfChangeApprovalInput = { decision, comments };
      const mutation =
        stage === "technical" ? technicalMutation : managementMutation;

      await mutation.mutateAsync({ id: item.id, input });

      setSuccess(
        decision === "APPROVED"
          ? `${stage === "technical" ? "Technical" : "Management"} approval recorded.`
          : `${stage === "technical" ? "Technical" : "Management"} rejection recorded. Implementation is blocked.`,
      );
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Unable to record the approval decision.",
      );
    }
  }

  const isPending =
    submitMutation.isPending ||
    technicalMutation.isPending ||
    managementMutation.isPending;

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-foreground">Approval actions</h2>
        <p className="mt-1 text-sm text-muted">
          Technical/HSE approval is recorded by an HSE manager. Management
          approval is recorded by an administrator after technical approval.
        </p>
      </div>

      {canSubmit && (
        <div className="rounded-lg border border-line px-3 py-3">
          <p className="text-sm text-foreground">
            The impact assessment is ready for submission.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isPending}
              isLoading={submitMutation.isPending}
            >
              Submit for approval
            </Button>
          </div>
        </div>
      )}

      {canTechnical && (
        <div className="rounded-lg border border-line px-3 py-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Technical/HSE approval comments
            </span>
            <textarea
              className="min-h-24 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
              value={technicalComments}
              onChange={(event) => setTechnicalComments(event.target.value)}
              maxLength={2000}
              placeholder="Record the technical review outcome and any conditions."
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleDecision("technical", "APPROVED")}
              disabled={isPending}
              isLoading={technicalMutation.isPending}
            >
              Record technical approval
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDecision("technical", "REJECTED")}
              disabled={isPending}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {canManagement && (
        <div className="rounded-lg border border-line px-3 py-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Management approval comments
            </span>
            <textarea
              className="min-h-24 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100"
              value={managementComments}
              onChange={(event) => setManagementComments(event.target.value)}
              maxLength={2000}
              placeholder="Record the management decision and any conditions."
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleDecision("management", "APPROVED")}
              disabled={isPending}
              isLoading={managementMutation.isPending}
            >
              Record management approval
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDecision("management", "REJECTED")}
              disabled={isPending}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {item.status === "PENDING_APPROVAL" &&
        selfApprovalBlocked &&
        (canApproveManagementOfChangeTechnical(role) ||
          canApproveManagementOfChangeManagement(role)) && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You cannot approve a change request you own, created or submitted.
          </p>
        )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {success}
        </p>
      )}
    </section>
  );
}
