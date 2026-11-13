import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import { canViewCorrectiveActions } from "./hse-permissions.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for corrective action scoping. */
export interface CorrectiveActionViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal action shape required to decide visibility. */
export interface CorrectiveActionAccessLike {
  assignedTo?: unknown;
  site?: unknown;
}

/**
 * Resolves a Mongoose reference to its id string.
 *
 * References arrive either populated (a hydrated or lean document carrying
 * `_id`) or raw (an ObjectId or string). Hydrated documents override
 * `toString()` to return an inspect dump, so comparing them directly would
 * never match a viewer id.
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
 * Mongo filter for the corrective action register.
 *
 * HSE management sees every action. Other HSE roles see actions at their
 * assigned sites plus actions assigned directly to them. Roles without the
 * `viewCorrectiveActions` capability (ordinary employees) match nothing.
 */
export function correctiveActionScopeFilter(
  viewer: CorrectiveActionViewer,
): Record<string, unknown> {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return {};
  }

  if (!canViewCorrectiveActions(viewer.ikoshRole)) {
    return { _id: { $in: [] } };
  }

  return {
    $or: [
      { assignedTo: viewer._id },
      { site: { $in: viewer.assignedSites ?? [] } },
    ],
  };
}

/** True for HSE management, the assignee, or an employee at the action site. */
export function canAccessCorrectiveAction(
  viewer: CorrectiveActionViewer,
  action: CorrectiveActionAccessLike,
): boolean {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return true;
  }

  if (!canViewCorrectiveActions(viewer.ikoshRole)) {
    return false;
  }

  const assigneeId = referenceId(action.assignedTo);

  if (assigneeId !== null && assigneeId === String(viewer._id)) {
    return true;
  }

  const siteId = referenceId(action.site);
  return siteId !== null ? isSiteAssigned(viewer, siteId) : false;
}

/**
 * Throws a 404 for out-of-scope actions so callers do not leak whether the
 * action exists.
 */
export function assertCorrectiveActionAccess(
  viewer: CorrectiveActionViewer,
  action: CorrectiveActionAccessLike,
): void {
  if (!canAccessCorrectiveAction(viewer, action)) {
    throw new HttpError(404, "Corrective action not found.");
  }
}

/**
 * Evidence upload is narrower than visibility: only HSE management, the
 * action creator and the assignee may attach files to an action. Verified
 * actions are closed, so they accept no new evidence.
 */
export function canUploadCorrectiveActionEvidence(
  viewer: CorrectiveActionViewer,
  action: { createdBy?: unknown; assignedTo?: unknown; status?: string },
): boolean {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return action.status !== "VERIFIED";
  }

  if (!canViewCorrectiveActions(viewer.ikoshRole)) {
    return false;
  }

  if (action.status === "VERIFIED") {
    return false;
  }

  const creatorId = referenceId(action.createdBy);
  const assigneeId = referenceId(action.assignedTo);

  return (
    creatorId !== null && creatorId === String(viewer._id)
  ) || (assigneeId !== null && assigneeId === String(viewer._id));
}
