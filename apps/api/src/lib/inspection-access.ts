import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import { canViewInspections } from "./hse-permissions.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for inspection scoping. */
export interface InspectionViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal inspection shape required to decide visibility. */
export interface InspectionAccessLike {
  inspector?: unknown;
  site?: unknown;
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

/**
 * Mongo filter for the inspection register.
 *
 * HSE management sees every inspection. Other HSE roles see inspections at
 * their assigned sites and inspections they are responsible for. Roles without
 * the `viewInspections` capability match nothing.
 */
export function inspectionScopeFilter(
  viewer: InspectionViewer,
): Record<string, unknown> {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return {};
  }

  if (!canViewInspections(viewer.ikoshRole)) {
    return { _id: { $in: [] } };
  }

  return {
    $or: [
      { inspector: viewer._id },
      { site: { $in: viewer.assignedSites ?? [] } },
    ],
  };
}

/** True for HSE management, the assigned inspector, or staff at the site. */
export function canAccessInspection(
  viewer: InspectionViewer,
  inspection: InspectionAccessLike,
): boolean {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return true;
  }

  if (!canViewInspections(viewer.ikoshRole)) {
    return false;
  }

  const inspectorId = referenceId(inspection.inspector);

  if (inspectorId !== null && inspectorId === String(viewer._id)) {
    return true;
  }

  const siteId = referenceId(inspection.site);
  return siteId !== null ? isSiteAssigned(viewer, siteId) : false;
}

/**
 * Throws a 404 for out-of-scope inspections so callers do not leak whether the
 * inspection exists.
 */
export function assertInspectionAccess(
  viewer: InspectionViewer,
  inspection: InspectionAccessLike,
): void {
  if (!canAccessInspection(viewer, inspection)) {
    throw new HttpError(404, "Inspection not found.");
  }
}

/**
 * Evidence upload is narrower than visibility: only HSE management, the
 * creator and the assigned inspector may attach files. Cancelled inspections
 * are closed and accept no new evidence.
 */
export function canUploadInspectionEvidence(
  viewer: InspectionViewer,
  inspection: { createdBy?: unknown; inspector?: unknown; status?: string },
): boolean {
  if (inspection.status === "CANCELLED") {
    return false;
  }

  if (isHseManagementRole(viewer.ikoshRole)) {
    return true;
  }

  if (!canViewInspections(viewer.ikoshRole)) {
    return false;
  }

  const creatorId = referenceId(inspection.createdBy);
  const inspectorId = referenceId(inspection.inspector);

  return (
    (creatorId !== null && creatorId === String(viewer._id)) ||
    (inspectorId !== null && inspectorId === String(viewer._id))
  );
}
