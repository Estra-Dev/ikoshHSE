import { HttpError } from "./http-error.js";
import { canViewAllSites } from "./hse-permissions.js";

/** Shape required from an authenticated IKOSH employee for site scoping. */
export interface SiteScopedViewer {
  ikoshRole: string;
  assignedSites?: readonly unknown[] | null;
}

/**
 * Builds a Mongo filter for site-scoped collections.
 *
 * HSE management sees all sites. Everyone else is restricted to
 * `assignedSites`; an empty assignment list matches no records, never all
 * records.
 */
export function siteScopeFilter(
  viewer: SiteScopedViewer,
  field = "_id",
): Record<string, unknown> {
  if (canViewAllSites(viewer.ikoshRole)) {
    return {};
  }

  return { [field]: { $in: viewer.assignedSites ?? [] } };
}

/** True only when the viewer is HSE management or explicitly assigned. */
export function isSiteAssigned(
  viewer: SiteScopedViewer,
  siteId: unknown,
): boolean {
  if (canViewAllSites(viewer.ikoshRole)) {
    return true;
  }

  const target = String(siteId);
  return (viewer.assignedSites ?? []).some(
    (assignedSite) => String(assignedSite) === target,
  );
}

/**
 * Throws a 404 for inaccessible site-bound resources so callers do not leak
 * whether the resource exists.
 */
export function assertSiteAccess(
  viewer: SiteScopedViewer,
  siteId: unknown,
): void {
  if (!isSiteAssigned(viewer, siteId)) {
    throw new HttpError(404, "Site not found.");
  }
}
