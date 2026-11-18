import { HttpError } from "./http-error.js";
import {
  canIssuePpe,
  canViewAllSites,
  canViewPpe,
} from "./hse-permissions.js";
import { assertSiteAccess, type SiteScopedViewer } from "./site-access.js";

/** Minimal PPE record shape required for historical access checks. */
export interface PpeSiteRecord {
  site?: unknown;
}

/** Throws 403 when the viewer cannot read PPE records at all. */
export function assertPpeRegisterAccess(viewer: { ikoshRole: string }): void {
  if (!canViewPpe(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to view PPE records.");
  }
}

/** Throws 403 when the viewer cannot issue or change PPE records. */
export function assertPpeIssueAccess(viewer: { ikoshRole: string }): void {
  if (!canIssuePpe(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to issue PPE.");
  }
}

/**
 * Site scope for PPE registers.
 *
 * PPE is always site-bound. HSE management sees all sites; every other role
 * is restricted to its assigned sites. An empty assignment list matches no
 * records rather than all records.
 */
export function ppeScopeFilter(
  viewer: SiteScopedViewer,
): Record<string, unknown> {
  return canViewAllSites(viewer.ikoshRole)
    ? {}
    : { site: { $in: viewer.assignedSites ?? [] } };
}

/**
 * Historical PPE records are checked against the site stored on the record,
 * not the person's current deployment. A person can move sites without losing
 * access to the issuance history that belongs to the original site.
 */
export function assertPpeRecordAccess(
  viewer: SiteScopedViewer,
  record: PpeSiteRecord,
): void {
  if (record.site === null || record.site === undefined) {
    throw new HttpError(404, "PPE record not found.");
  }

  // Detail responses populate the site reference, so resolve the id from a
  // populated document as well as a raw ObjectId.
  const siteId =
    typeof record.site === "object" && "_id" in record.site
      ? (record.site as { _id: unknown })._id
      : record.site;

  assertSiteAccess(viewer, siteId);
}
