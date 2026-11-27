import { HttpError } from "./http-error.js";
import { canViewAllSites, canViewManagementOfChange } from "./hse-permissions.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for MOC scoping. */
export interface ManagementOfChangeViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal change request shape required to decide visibility. */
export interface ManagementOfChangeAccessLike {
  project?: unknown;
  site?: unknown;
  changeOwner?: unknown;
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

function isOwner(
  viewer: ManagementOfChangeViewer,
  change: ManagementOfChangeAccessLike,
): boolean {
  return referenceId(change.changeOwner) === String(viewer._id);
}

function isCreator(
  viewer: ManagementOfChangeViewer,
  change: ManagementOfChangeAccessLike,
): boolean {
  return referenceId(change.createdBy) === String(viewer._id);
}

/**
 * Mongo filter for the MOC register.
 *
 * HSE management sees every change request. Supervisors and HSE officers see
 * records at their assigned sites plus records they own or created. A record
 * with no site is visible only to its owner, creator or HSE management; an
 * empty assignment list never widens access.
 */
export function managementOfChangeScopeFilter(
  viewer: ManagementOfChangeViewer,
): Record<string, unknown> {
  if (!canViewManagementOfChange(viewer.ikoshRole)) {
    return { _id: { $in: [] } };
  }

  if (canViewAllSites(viewer.ikoshRole)) {
    return {};
  }

  return {
    $or: [
      { site: { $in: viewer.assignedSites ?? [] } },
      { changeOwner: viewer._id },
      { createdBy: viewer._id },
    ],
  };
}

/** True only when the viewer may read the change request. */
export function canAccessManagementOfChange(
  viewer: ManagementOfChangeViewer,
  change: ManagementOfChangeAccessLike,
): boolean {
  if (!canViewManagementOfChange(viewer.ikoshRole)) {
    return false;
  }

  if (canViewAllSites(viewer.ikoshRole)) {
    return true;
  }

  const siteId = referenceId(change.site);

  return (
    (siteId !== null && isSiteAssigned(viewer, siteId)) ||
    isOwner(viewer, change) ||
    isCreator(viewer, change)
  );
}

/**
 * Throws a 404 for out-of-scope records so callers do not leak whether the
 * change request exists.
 */
export function assertManagementOfChangeAccess(
  viewer: ManagementOfChangeViewer,
  change: ManagementOfChangeAccessLike,
): void {
  if (!canAccessManagementOfChange(viewer, change)) {
    throw new HttpError(404, "Change request not found.");
  }
}
