import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import {
  canEditRiskAssessments,
  canManageRiskAssessments,
  canViewRiskAssessments,
} from "./hse-permissions.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for risk assessment scoping. */
export interface RiskAssessmentViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal risk assessment shape required to decide visibility. */
export interface RiskAssessmentAccessLike {
  site?: unknown;
  owner?: unknown;
  createdBy?: unknown;
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

function isOwner(viewer: RiskAssessmentViewer, assessment: RiskAssessmentAccessLike): boolean {
  return referenceId(assessment.owner) === String(viewer._id);
}

function isCreator(
  viewer: RiskAssessmentViewer,
  assessment: RiskAssessmentAccessLike,
): boolean {
  return referenceId(assessment.createdBy) === String(viewer._id);
}

/**
 * Mongo filter for the risk assessment register.
 *
 * HSE management sees every assessment. Supervisors and HSE officers see
 * assessments at their assigned sites plus the ones they own or created, so a
 * project-level assessment remains reachable by its author. Roles without the
 * view capability match nothing.
 */
export function riskAssessmentScopeFilter(
  viewer: RiskAssessmentViewer,
): Record<string, unknown> {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return {};
  }

  if (!canViewRiskAssessments(viewer.ikoshRole)) {
    return { _id: { $in: [] } };
  }

  return {
    $or: [
      { site: { $in: viewer.assignedSites ?? [] } },
      { owner: viewer._id },
      { createdBy: viewer._id },
    ],
  };
}

/** True for HSE management, the owner/creator, or site-assigned staff. */
export function canAccessRiskAssessment(
  viewer: RiskAssessmentViewer,
  assessment: RiskAssessmentAccessLike,
): boolean {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return true;
  }

  if (!canViewRiskAssessments(viewer.ikoshRole)) {
    return false;
  }

  if (isOwner(viewer, assessment) || isCreator(viewer, assessment)) {
    return true;
  }

  const siteId = referenceId(assessment.site);
  return siteId !== null ? isSiteAssigned(viewer, siteId) : false;
}

/**
 * Throws a 404 for out-of-scope assessments so callers do not leak whether the
 * assessment exists.
 */
export function assertRiskAssessmentAccess(
  viewer: RiskAssessmentViewer,
  assessment: RiskAssessmentAccessLike,
): void {
  if (!canAccessRiskAssessment(viewer, assessment)) {
    throw new HttpError(404, "Risk assessment not found.");
  }
}

/**
 * Content editing requires the edit capability, the author/owner relationship
 * (or HSE management) and DRAFT status. Approved and archived assessments are
 * immutable except for archiving.
 */
export function canEditRiskAssessment(
  viewer: RiskAssessmentViewer,
  assessment: RiskAssessmentAccessLike & { status?: string },
): boolean {
  if (assessment.status !== "DRAFT") {
    return false;
  }

  if (!canEditRiskAssessments(viewer.ikoshRole)) {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isOwner(viewer, assessment) ||
    isCreator(viewer, assessment)
  );
}

/** Submitting for review is an author action; management may submit anything. */
export function canSubmitRiskAssessment(
  viewer: RiskAssessmentViewer,
  assessment: RiskAssessmentAccessLike & { status?: string },
): boolean {
  return canEditRiskAssessment(viewer, assessment);
}

/** Only HSE management may approve, return to draft or archive. */
export function canManageRiskAssessment(viewer: RiskAssessmentViewer): boolean {
  return canManageRiskAssessments(viewer.ikoshRole);
}

/**
 * Evidence uploads are narrower than read visibility: HSE management, the
 * owner or the creator may attach supporting files, and archived assessments
 * accept none. The API remains authoritative; this mirrors the rule for the
 * web client.
 */
export function canUploadRiskAssessmentEvidence(
  viewer: RiskAssessmentViewer,
  assessment: RiskAssessmentAccessLike & { status?: string },
): boolean {
  if (
    !canViewRiskAssessments(viewer.ikoshRole) ||
    assessment.status === "ARCHIVED"
  ) {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isOwner(viewer, assessment) ||
    isCreator(viewer, assessment)
  );
}
