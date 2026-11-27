/**
 * A03 management-of-change approval policy.
 *
 * The two-stage approval workflow is implemented, but A03 is still a draft.
 * Activation therefore requires an explicit, server-side management decision.
 * Setting MOC_APPROVAL_ACTIVATED=true is that confirmation: no request body,
 * user role or client action can activate the workflow.
 */
export interface ManagementOfChangeApprovalPolicy {
  sop: "A03";
  sopStatus: "DRAFT";
  activationConfirmed: boolean;
  delegatedAuthorityEstablished: boolean;
  submissionAllowed: boolean;
  approvalAllowed: boolean;
  implementationAllowed: boolean;
  message: string;
}

const INACTIVE_MESSAGE =
  "A03 management-of-change approval is not activated. The SOP is still a draft and activation requires formal management confirmation. Change requests cannot be submitted, approved or implemented until then.";

const ACTIVE_MESSAGE =
  "Two-stage approval is active. An HSE manager must record technical/HSE approval before an administrator records management approval. Both approvals are required before implementation, and neither approver may approve their own change request.";

/** True only when formal management confirmation has activated A03 approvals. */
export function isManagementOfChangeApprovalEnabled(): boolean {
  return (
    process.env.MOC_APPROVAL_ACTIVATED?.trim().toLowerCase() === "true"
  );
}

/** Current server-derived approval policy returned to clients. */
export function getManagementOfChangeApprovalPolicy(): ManagementOfChangeApprovalPolicy {
  const activationConfirmed = isManagementOfChangeApprovalEnabled();

  return {
    sop: "A03",
    sopStatus: "DRAFT",
    activationConfirmed,
    delegatedAuthorityEstablished: activationConfirmed,
    submissionAllowed: activationConfirmed,
    approvalAllowed: activationConfirmed,
    implementationAllowed: activationConfirmed,
    message: activationConfirmed ? ACTIVE_MESSAGE : INACTIVE_MESSAGE,
  };
}

/**
 * Implementation requires recorded technical and management approval. A
 * rejection at either stage permanently blocks implementation. The workflow
 * also remains blocked while A03 approvals are inactive.
 */
export function hasRequiredManagementOfChangeApprovals(change: {
  approvals?: readonly {
    approvalType?: string | null;
    decision?: string | null;
  }[];
}): boolean {
  if (!isManagementOfChangeApprovalEnabled()) {
    return false;
  }

  const approvals = change.approvals ?? [];

  if (approvals.some((approval) => approval.decision === "REJECTED")) {
    return false;
  }

  return (
    approvals.some(
      (approval) =>
        approval.approvalType === "TECHNICAL" &&
        approval.decision === "APPROVED",
    ) &&
    approvals.some(
      (approval) =>
        approval.approvalType === "MANAGEMENT" &&
        approval.decision === "APPROVED",
    )
  );
}
