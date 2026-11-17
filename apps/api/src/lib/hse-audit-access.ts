import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import { canViewAudits } from "./hse-permissions.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for HSE audit scoping. */
export interface HseAuditViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal audit shape required to decide visibility. */
export interface HseAuditAccessLike {
  auditors?: unknown;
  site?: unknown;
  createdBy?: unknown;
  status?: string;
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

function auditorIds(audit: HseAuditAccessLike): string[] {
  return Array.isArray(audit.auditors)
    ? audit.auditors
        .map((auditor) => referenceId(auditor))
        .filter((id): id is string => id !== null)
    : [];
}

/** True when the viewer is one of the audit's assigned auditors. */
export function isAuditAuditor(
  viewer: HseAuditViewer,
  audit: HseAuditAccessLike,
): boolean {
  return auditorIds(audit).includes(String(viewer._id));
}

/**
 * Mongo filter for the audit register.
 *
 * HSE management sees every audit. Other HSE roles see audits at their
 * assigned sites and audits assigned to them as an auditor. Roles without the
 * `viewAudits` capability match nothing.
 */
export function hseAuditScopeFilter(
  viewer: HseAuditViewer,
): Record<string, unknown> {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return {};
  }

  if (!canViewAudits(viewer.ikoshRole)) {
    return { _id: { $in: [] } };
  }

  return {
    $or: [
      { auditors: viewer._id },
      { site: { $in: viewer.assignedSites ?? [] } },
    ],
  };
}

/** True for HSE management, an assigned auditor, or staff at the site. */
export function canAccessHseAudit(
  viewer: HseAuditViewer,
  audit: HseAuditAccessLike,
): boolean {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return true;
  }

  if (!canViewAudits(viewer.ikoshRole)) {
    return false;
  }

  if (isAuditAuditor(viewer, audit)) {
    return true;
  }

  const siteId = referenceId(audit.site);
  return siteId !== null ? isSiteAssigned(viewer, siteId) : false;
}

/**
 * Throws a 404 for out-of-scope audits so callers do not leak whether the
 * audit exists.
 */
export function assertHseAuditAccess(
  viewer: HseAuditViewer,
  audit: HseAuditAccessLike,
): void {
  if (!canAccessHseAudit(viewer, audit)) {
    throw new HttpError(404, "Audit not found.");
  }
}

/**
 * Evidence upload is narrower than visibility: only HSE management, the
 * creator and assigned auditors may attach files. Completed and cancelled
 * audits are closed and accept no new evidence.
 */
export function canUploadHseAuditEvidence(
  viewer: HseAuditViewer,
  audit: HseAuditAccessLike,
): boolean {
  if (audit.status === "COMPLETED" || audit.status === "CANCELLED") {
    return false;
  }

  if (isHseManagementRole(viewer.ikoshRole)) {
    return true;
  }

  if (!canViewAudits(viewer.ikoshRole)) {
    return false;
  }

  const creatorId = referenceId(audit.createdBy);
  return (
    (creatorId !== null && creatorId === String(viewer._id)) ||
    isAuditAuditor(viewer, audit)
  );
}
