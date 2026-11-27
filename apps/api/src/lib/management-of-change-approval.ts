import { HttpError } from "./http-error.js";
import {
  canApproveManagementOfChangeManagement,
  canApproveManagementOfChangeTechnical,
} from "./hse-permissions.js";
import {
  getManagementOfChangeApprovalPolicy,
  isManagementOfChangeApprovalEnabled,
} from "./management-of-change-policy.js";

export const MANAGEMENT_OF_CHANGE_APPROVAL_STAGES = [
  "TECHNICAL",
  "MANAGEMENT",
] as const;

export type ManagementOfChangeApprovalStage =
  (typeof MANAGEMENT_OF_CHANGE_APPROVAL_STAGES)[number];

export type ManagementOfChangeApprovalDecision = "APPROVED" | "REJECTED";

/** Authenticated employee shape required to record an approval. */
export interface ManagementOfChangeApprovalViewer {
  _id: unknown;
  ikoshRole: string;
}

/** Minimal approval shape required for stage and duplicate checks. */
export interface ManagementOfChangeApprovalLike {
  approvalType?: string | null;
  approver?: unknown;
  decision?: string | null;
}

/** Minimal change request shape required to decide approval eligibility. */
export interface ManagementOfChangeApprovalChangeLike {
  status?: string | null;
  changeOwner?: unknown;
  createdBy?: unknown;
  submittedBy?: unknown;
  approvals?: readonly ManagementOfChangeApprovalLike[] | null;
}

/**
 * Resolves a Mongoose reference to its id string. References arrive either
 * populated or raw; hydrated documents cannot be compared directly.
 */
function referenceId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    if ("_id" in value) {
      const id = (value as { _id: unknown })._id;
      return id === null || id === undefined ? null : String(id);
    }

    return String(value);
  }

  return String(value);
}

function isSameActor(actorId: unknown, reference: unknown): boolean {
  const value = referenceId(reference);
  return value !== null && value === String(actorId);
}

function approvalForStage(
  change: ManagementOfChangeApprovalChangeLike,
  stage: ManagementOfChangeApprovalStage,
): ManagementOfChangeApprovalLike | undefined {
  return (change.approvals ?? []).find(
    (approval) => approval.approvalType === stage,
  );
}

function hasApprovedStage(
  change: ManagementOfChangeApprovalChangeLike,
  stage: ManagementOfChangeApprovalStage,
): boolean {
  return (
    approvalForStage(change, stage)?.decision === "APPROVED"
  );
}

/** True when the viewer may record the requested approval stage. */
export function canApproveManagementOfChangeStage(
  viewer: ManagementOfChangeApprovalViewer,
  change: ManagementOfChangeApprovalChangeLike,
  stage: ManagementOfChangeApprovalStage,
): boolean {
  if (!isManagementOfChangeApprovalEnabled()) {
    return false;
  }

  if (change.status !== "PENDING_APPROVAL") {
    return false;
  }

  const hasStagePermission =
    stage === "TECHNICAL"
      ? canApproveManagementOfChangeTechnical(viewer.ikoshRole)
      : canApproveManagementOfChangeManagement(viewer.ikoshRole);

  if (!hasStagePermission) {
    return false;
  }

  if (
    isSameActor(viewer._id, change.changeOwner) ||
    isSameActor(viewer._id, change.createdBy) ||
    isSameActor(viewer._id, change.submittedBy)
  ) {
    return false;
  }

  if (approvalForStage(change, stage)) {
    return false;
  }

  if (
    (change.approvals ?? []).some((approval) =>
      isSameActor(viewer._id, approval.approver),
    )
  ) {
    return false;
  }

  if (stage === "MANAGEMENT" && !hasApprovedStage(change, "TECHNICAL")) {
    return false;
  }

  return true;
}

/**
 * Throws the domain error for an approval attempt. Role failures are 403;
 * invalid workflow state, duplicate stages and stage-order failures are 409.
 */
export function assertManagementOfChangeApprovalAllowed(
  viewer: ManagementOfChangeApprovalViewer,
  change: ManagementOfChangeApprovalChangeLike,
  stage: ManagementOfChangeApprovalStage,
): void {
  if (!isManagementOfChangeApprovalEnabled()) {
    throw new HttpError(
      409,
      getManagementOfChangeApprovalPolicy().message,
    );
  }

  if (change.status !== "PENDING_APPROVAL") {
    throw new HttpError(409, "Change request is not awaiting approval.");
  }

  const hasStagePermission =
    stage === "TECHNICAL"
      ? canApproveManagementOfChangeTechnical(viewer.ikoshRole)
      : canApproveManagementOfChangeManagement(viewer.ikoshRole);

  if (!hasStagePermission) {
    throw new HttpError(
      403,
      "You do not have permission to record this approval stage.",
    );
  }

  if (
    isSameActor(viewer._id, change.changeOwner) ||
    isSameActor(viewer._id, change.createdBy) ||
    isSameActor(viewer._id, change.submittedBy)
  ) {
    throw new HttpError(
      403,
      "You cannot approve a change request you own, created or submitted.",
    );
  }

  if (approvalForStage(change, stage)) {
    throw new HttpError(
      409,
      `${stage === "TECHNICAL" ? "Technical" : "Management"} approval has already been recorded.`,
    );
  }

  if (
    (change.approvals ?? []).some((approval) =>
      isSameActor(viewer._id, approval.approver),
    )
  ) {
    throw new HttpError(
      403,
      "You cannot record both approval stages for the same change request.",
    );
  }

  if (stage === "MANAGEMENT" && !hasApprovedStage(change, "TECHNICAL")) {
    throw new HttpError(
      409,
      "Management approval requires recorded technical approval first.",
    );
  }
}

/**
 * Derives the workflow status from the recorded approval decisions. A
 * rejection always wins so implementation can never bypass a rejection.
 */
export function deriveManagementOfChangeApprovalStatus(
  change: ManagementOfChangeApprovalChangeLike,
): "PENDING_APPROVAL" | "APPROVED" | "REJECTED" {
  const approvals = change.approvals ?? [];

  if (approvals.some((approval) => approval.decision === "REJECTED")) {
    return "REJECTED";
  }

  if (
    hasApprovedStage(change, "TECHNICAL") &&
    hasApprovedStage(change, "MANAGEMENT")
  ) {
    return "APPROVED";
  }

  return "PENDING_APPROVAL";
}

/** Server-controlled authority basis stored with each approval. */
export function managementOfChangeApprovalAuthorityBasis(
  stage: ManagementOfChangeApprovalStage,
): string {
  return stage === "TECHNICAL"
    ? "SOP A03 (draft) - HSE manager technical approval"
    : "SOP A03 (draft) - administrator management approval";
}

/** Append-only audit action for one approval decision. */
export function managementOfChangeApprovalAuditAction(
  stage: ManagementOfChangeApprovalStage,
  decision: ManagementOfChangeApprovalDecision,
): string {
  return `management_of_change.${stage.toLowerCase()}_${
    decision === "APPROVED" ? "approved" : "rejected"
  }`;
}
