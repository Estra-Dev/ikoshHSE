import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import {
  canCreateToolboxTalks,
  canManageToolboxTalks,
  canViewAllSites,
  canViewToolboxTalks,
} from "./hse-permissions.js";
import { isToolboxTalkTerminalStatus } from "./hse-constants.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for toolbox talk scoping. */
export interface ToolboxTalkViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal talk shape required to decide visibility and actions. */
export interface ToolboxTalkAccessLike {
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
 * Builds a Mongo filter for toolbox talk visibility. Talks are site-scoped:
 * HSE management sees every site; everyone else sees talks at their assigned
 * sites only. An empty assignment list matches nothing.
 */
export function toolboxTalkScopeFilter(
  viewer: ToolboxTalkViewer,
): Record<string, unknown> {
  if (canViewAllSites(viewer.ikoshRole)) {
    return {};
  }

  return { site: { $in: viewer.assignedSites ?? [] } };
}

/** True only when the viewer may read the talk. */
export function canAccessToolboxTalk(
  viewer: ToolboxTalkViewer,
  talk: ToolboxTalkAccessLike,
): boolean {
  if (!canViewToolboxTalks(viewer.ikoshRole)) {
    return false;
  }

  if (canViewAllSites(viewer.ikoshRole)) {
    return true;
  }

  return isSiteAssigned(viewer, talk.site);
}

/** Throws 404 so out-of-scope talks do not leak their existence. */
export function assertToolboxTalkAccess(
  viewer: ToolboxTalkViewer,
  talk: ToolboxTalkAccessLike,
): void {
  if (!canAccessToolboxTalk(viewer, talk)) {
    throw new HttpError(404, "Toolbox talk not found.");
  }
}

/**
 * Content and attendance are editable only while scheduled, by the author or
 * HSE management. Terminal talks are immutable.
 */
export function canEditToolboxTalk(
  viewer: ToolboxTalkViewer,
  talk: ToolboxTalkAccessLike,
): boolean {
  if (
    !canCreateToolboxTalks(viewer.ikoshRole) ||
    talk.status !== "SCHEDULED"
  ) {
    return false;
  }

  return (
    isHseManagementRole(viewer.ikoshRole) ||
    isSameActor(viewer._id, talk.createdBy)
  );
}

/** Authors and managers record the terminal transition of a scheduled talk. */
export function canCompleteToolboxTalk(
  viewer: ToolboxTalkViewer,
  talk: ToolboxTalkAccessLike,
): boolean {
  return canEditToolboxTalk(viewer, talk);
}

export function canCancelToolboxTalk(
  viewer: ToolboxTalkViewer,
  talk: ToolboxTalkAccessLike,
): boolean {
  return canEditToolboxTalk(viewer, talk);
}

/**
 * Evidence uploads follow the talk and are narrower than read visibility:
 * management or the author may attach files, and terminal talks accept none.
 * Ordinary employees never have register access and therefore cannot upload.
 */
export function canUploadToolboxTalkEvidence(
  viewer: ToolboxTalkViewer,
  talk: ToolboxTalkAccessLike,
): boolean {
  if (!canViewToolboxTalks(viewer.ikoshRole)) {
    return false;
  }

  if (isToolboxTalkTerminalStatus(talk.status)) {
    return false;
  }

  return (
    canManageToolboxTalks(viewer.ikoshRole) ||
    isSameActor(viewer._id, talk.createdBy)
  );
}
