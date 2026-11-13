import type { IkoshRole } from "./api/types";

/**
 * Client-side mirrors of the server-side authorization rules. These only
 * control which UI affordances are visible; the API re-validates every
 * action against the MongoDB employee record.
 */

export function isManagementRole(role: IkoshRole | undefined): boolean {
  return (
    role === "SUPERVISOR" ||
    role === "HSE_OFFICER" ||
    role === "HSE_MANAGER" ||
    role === "ADMIN"
  );
}

export function isHseManagementRole(role: IkoshRole | undefined): boolean {
  return role === "HSE_MANAGER" || role === "ADMIN";
}

/**
 * Server-side management roles mirrored for client-side UI visibility.
 * Used in directory filters and permissions UI.
 */
export const MANAGEMENT_ROLES: readonly IkoshRole[] = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
];

export function isAdmin(role: IkoshRole | undefined): boolean {
  return role === "ADMIN";
}

/** Full profiles (employment/administrative information) visibility. */
export function canViewFullProfile(
  viewerRole: IkoshRole | undefined,
  isSelf: boolean,
): boolean {
  return isSelf || isManagementRole(viewerRole);
}

/** Editing employment information, roles and status is admin-only. */
export function canEditEmploymentInfo(role: IkoshRole | undefined): boolean {
  return isAdmin(role);
}

export function canManageDepartments(role: IkoshRole | undefined): boolean {
  return isAdmin(role);
}

/** Inactive employees can only be listed by management roles. */
export function canListInactiveEmployees(
  role: IkoshRole | undefined,
): boolean {
  return isManagementRole(role);
}

/** Every authenticated IKOSH role may file an incident or near-miss report. */
export function canReportIncidents(role: IkoshRole | undefined): boolean {
  return role !== undefined;
}

/**
 * Site access administration is restricted to HSE managers and
 * administrators. The API enforces the same rule.
 */
export function canManagePersonnelAccess(
  role: IkoshRole | undefined,
): boolean {
  return isHseManagementRole(role);
}

/**
 * Projects and sites are HSE reference data: only HSE managers and
 * administrators may create, edit, change status or delete them. The API
 * enforces the same rule.
 */
export function canManageWorksites(role: IkoshRole | undefined): boolean {
  return isHseManagementRole(role);
}

/** Classification and workflow status changes are HSE manager/admin only. */
export function canManageIncidentWorkflow(
  role: IkoshRole | undefined,
): boolean {
  return isHseManagementRole(role);
}

interface EditableIncident {
  reportedBy: { id: string };
  status: "REPORTED" | "TRIAGED" | "CLOSED";
}

/**
 * Mirrors `PATCH /api/incidents/:id`: HSE management may edit content at any
 * status, while a reporter may only edit their own report before triage.
 */
export function canEditIncidentReport(
  role: IkoshRole | undefined,
  viewerId: string | undefined,
  incident: EditableIncident,
): boolean {
  if (canManageIncidentWorkflow(role)) {
    return true;
  }

  return (
    role !== undefined &&
    viewerId !== undefined &&
    incident.reportedBy.id === viewerId &&
    incident.status === "REPORTED"
  );
}
