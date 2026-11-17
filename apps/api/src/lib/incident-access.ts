import { HttpError } from "./http-error.js";
import { isManagementRole } from "./ikosh-constants.js";
import { canReportIncident, canViewAllSites } from "./hse-permissions.js";
import { isSiteAssigned, type SiteScopedViewer } from "./site-access.js";

/** Authenticated employee shape required for incident scoping. */
export interface IncidentViewer extends SiteScopedViewer {
  _id: unknown;
}

/** Minimal incident shape required to decide visibility. */
export interface IncidentAccessLike {
  reportedBy?: unknown;
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

/** True when the viewer filed the report. */
export function isIncidentReporter(
  viewer: IncidentViewer,
  incident: IncidentAccessLike,
): boolean {
  return referenceId(incident.reportedBy) === String(viewer._id);
}

/**
 * Mongo filter for the incident register.
 *
 * HSE management sees every incident. Every other role sees reports at their
 * assigned sites **and** reports they filed themselves, so a reporter keeps
 * access after being reassigned. Roles without the reporting capability match
 * nothing, which keeps the check fail-closed for unknown roles.
 */
export function incidentScopeFilter(
  viewer: IncidentViewer,
): Record<string, unknown> {
  if (canViewAllSites(viewer.ikoshRole)) {
    return {};
  }

  if (!canReportIncident(viewer.ikoshRole)) {
    return { _id: { $in: [] } };
  }

  return {
    $or: [
      { site: { $in: viewer.assignedSites ?? [] } },
      { reportedBy: viewer._id },
    ],
  };
}

/** True for site-assigned staff or the reporter, regardless of reassignment. */
export function canAccessIncident(
  viewer: IncidentViewer,
  incident: IncidentAccessLike,
): boolean {
  if (!canReportIncident(viewer.ikoshRole)) {
    return false;
  }

  if (isIncidentReporter(viewer, incident)) {
    return true;
  }

  const siteId = referenceId(incident.site);
  return siteId !== null ? isSiteAssigned(viewer, siteId) : false;
}

/**
 * Throws a 404 for out-of-scope incidents so callers do not leak whether the
 * incident exists.
 */
export function assertIncidentAccess(
  viewer: IncidentViewer,
  incident: IncidentAccessLike,
): void {
  if (!canAccessIncident(viewer, incident)) {
    throw new HttpError(404, "Incident not found.");
  }
}

/**
 * Whether the viewer may read the unredacted report, including reporter
 * identity and immediate actions. Supervisors and HSE staff keep their
 * existing site-scoped access; ordinary employees only see their own report in
 * full so colleagues' reporter information and investigation details stay
 * private.
 */
export function canViewFullIncident(
  viewer: IncidentViewer,
  incident: IncidentAccessLike,
): boolean {
  if (!canAccessIncident(viewer, incident)) {
    return false;
  }

  return isManagementRole(viewer.ikoshRole) || isIncidentReporter(viewer, incident);
}

/**
 * Site-scoped incident evidence filter for supervisors and HSE staff, reduced
 * to the viewer's own reports for ordinary employees.
 */
export function incidentEvidenceFilter(
  viewer: IncidentViewer,
): Record<string, unknown> {
  if (canViewAllSites(viewer.ikoshRole)) {
    return {};
  }

  if (isManagementRole(viewer.ikoshRole)) {
    return { site: { $in: viewer.assignedSites ?? [] } };
  }

  if (!canReportIncident(viewer.ikoshRole)) {
    return { _id: { $in: [] } };
  }

  return { reportedBy: viewer._id };
}
