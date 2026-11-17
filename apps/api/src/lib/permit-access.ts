import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import {
  canApprovePermits,
  canCreatePermits,
  canManagePermits,
  canOperatePermits,
  canViewAllSites,
  canViewPermits,
} from "./hse-permissions.js";
import { isPermitTerminalStatus } from "./hse-constants.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for permit scoping. */
export interface PermitViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal permit shape required to decide visibility and actions. */
export interface PermitAccessLike {
  status?: string;
  site?: unknown;
  responsiblePerson?: unknown;
  createdBy?: unknown;
  submittedBy?: unknown;
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

function isResponsiblePerson(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  return isSameActor(viewer._id, permit.responsiblePerson);
}

function isCreator(viewer: PermitViewer, permit: PermitAccessLike): boolean {
  return isSameActor(viewer._id, permit.createdBy);
}

/**
 * Builds a Mongo filter for permit visibility.
 *
 * HSE management sees every permit. Everyone else sees permits at their
 * assigned sites, plus permits they are responsible for or created. An empty
 * assignment list therefore never widens access.
 */
export function permitScopeFilter(
  viewer: PermitViewer,
): Record<string, unknown> {
  if (canViewAllSites(viewer.ikoshRole)) {
    return {};
  }

  return {
    $or: [
      { site: { $in: viewer.assignedSites ?? [] } },
      { responsiblePerson: viewer._id },
      { createdBy: viewer._id },
    ],
  };
}

/** True only when the viewer may read the permit. */
export function canAccessPermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (!canViewPermits(viewer.ikoshRole)) {
    return false;
  }

  if (canViewAllSites(viewer.ikoshRole)) {
    return true;
  }

  return (
    isSiteAssigned(viewer, permit.site) ||
    isResponsiblePerson(viewer, permit) ||
    isCreator(viewer, permit)
  );
}

/** Throws 404 so out-of-scope permits do not leak their existence. */
export function assertPermitAccess(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): void {
  if (!canAccessPermit(viewer, permit)) {
    throw new HttpError(404, "Permit not found.");
  }
}

/** Content is editable only in DRAFT, by the creator, responsible person or management. */
export function canEditPermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (
    !canCreatePermits(viewer.ikoshRole) ||
    permit.status !== "DRAFT"
  ) {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isCreator(viewer, permit) ||
    isResponsiblePerson(viewer, permit)
  );
}

/** The same authors that can edit a draft can submit it for review. */
export function canSubmitPermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  return canEditPermit(viewer, permit);
}

/**
 * Approving and rejecting are HSE management actions. Self-approval is blocked
 * against the creator, the responsible person and the submitter so the same
 * person cannot author, submit and approve one permit.
 */
export function canApprovePermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (!canApprovePermits(viewer.ikoshRole) || permit.status !== "SUBMITTED") {
    return false;
  }

  return (
    !isCreator(viewer, permit) &&
    !isResponsiblePerson(viewer, permit) &&
    !isSameActor(viewer._id, permit.submittedBy)
  );
}

/** Activation is limited to the responsible person or HSE management. */
export function canActivatePermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (!canOperatePermits(viewer.ikoshRole) || permit.status !== "APPROVED") {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isResponsiblePerson(viewer, permit)
  );
}

/** Resuming a suspended permit follows the same rule as activation. */
export function canResumePermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (!canOperatePermits(viewer.ikoshRole) || permit.status !== "SUSPENDED") {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isResponsiblePerson(viewer, permit)
  );
}

/**
 * Suspension may be requested by the responsible person, an HSE officer with
 * access to the permit's site, or HSE management.
 */
export function canSuspendPermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (!canOperatePermits(viewer.ikoshRole) || permit.status !== "ACTIVE") {
    return false;
  }

  if (isHseManagementRole(viewer.ikoshRole)) {
    return true;
  }

  if (isResponsiblePerson(viewer, permit)) {
    return true;
  }

  return (
    viewer.ikoshRole === "HSE_OFFICER" && isSiteAssigned(viewer, permit.site)
  );
}

/**
 * Closure is allowed from ACTIVE or SUSPENDED, including after expiry. The
 * route requires every close-out check and non-empty notes.
 */
export function canClosePermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (
    !canOperatePermits(viewer.ikoshRole) ||
    (permit.status !== "ACTIVE" && permit.status !== "SUSPENDED")
  ) {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isResponsiblePerson(viewer, permit)
  );
}

/**
 * Cancellation rules: DRAFT/SUBMITTED permits may be cancelled by their
 * creators or responsible people as well as management; an APPROVED permit
 * only by management. ACTIVE and SUSPENDED permits must be suspended/closed
 * rather than cancelled, so an in-flight job never disappears from the log.
 */
export function canCancelPermit(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (canManagePermits(viewer.ikoshRole)) {
    return (
      permit.status === "DRAFT" ||
      permit.status === "SUBMITTED" ||
      permit.status === "APPROVED"
    );
  }

  if (!canCreatePermits(viewer.ikoshRole)) {
    return false;
  }

  if (permit.status !== "DRAFT" && permit.status !== "SUBMITTED") {
    return false;
  }

  return isCreator(viewer, permit) || isResponsiblePerson(viewer, permit);
}

/**
 * Evidence uploads follow the permit and are narrower than read visibility:
 * management, the creator or the responsible person may attach files, and
 * terminal permits accept none.
 */
export function canUploadPermitEvidence(
  viewer: PermitViewer,
  permit: PermitAccessLike,
): boolean {
  if (!canViewPermits(viewer.ikoshRole)) {
    return false;
  }

  if (isPermitTerminalStatus(permit.status)) {
    return false;
  }

  if (canManagePermits(viewer.ikoshRole)) {
    return true;
  }

  return isCreator(viewer, permit) || isResponsiblePerson(viewer, permit);
}
