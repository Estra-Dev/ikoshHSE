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
