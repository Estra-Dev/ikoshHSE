import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import {
  canCreateTraining,
  canManageTraining,
  canViewAllSites,
  canViewTraining,
} from "./hse-permissions.js";
import { isTrainingSessionTerminalStatus } from "./hse-constants.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for training scoping. */
export interface TrainingViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal session shape required to decide visibility and actions. */
export interface TrainingSessionAccessLike {
  status?: string;
  site?: unknown;
  createdBy?: unknown;
}

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

/**
 * Builds a Mongo filter for training-session visibility. Training is
 * site-scoped: HSE management sees every site; everyone else sees sessions at
 * their assigned sites only. An empty assignment list matches nothing.
 */
export function trainingScopeFilter(
  viewer: TrainingViewer,
): Record<string, unknown> {
  if (canViewAllSites(viewer.ikoshRole)) {
    return {};
  }

  return { site: { $in: viewer.assignedSites ?? [] } };
}

/** True only when the viewer may read the session. */
export function canAccessTrainingSession(
  viewer: TrainingViewer,
  session: TrainingSessionAccessLike,
): boolean {
  if (!canViewTraining(viewer.ikoshRole)) {
    return false;
  }

  if (canViewAllSites(viewer.ikoshRole)) {
    return true;
  }

  return isSiteAssigned(viewer, session.site);
}

/** Throws 404 so out-of-scope sessions do not leak their existence. */
export function assertTrainingSessionAccess(
  viewer: TrainingViewer,
  session: TrainingSessionAccessLike,
): void {
  if (!canAccessTrainingSession(viewer, session)) {
    throw new HttpError(404, "Training session not found.");
  }
}

/**
 * Content and attendance are editable only while scheduled, by the author or
 * HSE management. Terminal sessions are immutable.
 */
export function canEditTrainingSession(
  viewer: TrainingViewer,
  session: TrainingSessionAccessLike,
): boolean {
  if (
    !canCreateTraining(viewer.ikoshRole) ||
    session.status !== "SCHEDULED"
  ) {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isSameActor(viewer._id, session.createdBy)
  );
}

/** Authors and managers record the terminal transition of a scheduled session. */
export function canCompleteTrainingSession(
  viewer: TrainingViewer,
  session: TrainingSessionAccessLike,
): boolean {
  return canEditTrainingSession(viewer, session);
}

export function canCancelTrainingSession(
  viewer: TrainingViewer,
  session: TrainingSessionAccessLike,
): boolean {
  return canEditTrainingSession(viewer, session);
}

/**
 * Evidence uploads follow the session and are narrower than read visibility:
 * management or the author may attach files, and terminal sessions accept none.
 * Ordinary employees never have register access and therefore cannot upload.
 */
export function canUploadTrainingEvidence(
  viewer: TrainingViewer,
  session: TrainingSessionAccessLike,
): boolean {
  if (!canViewTraining(viewer.ikoshRole)) {
    return false;
  }

  if (isTrainingSessionTerminalStatus(session.status)) {
    return false;
  }

  return (
    canManageTraining(viewer.ikoshRole) ||
    isSameActor(viewer._id, session.createdBy)
  );
}
