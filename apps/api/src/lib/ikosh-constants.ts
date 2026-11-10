/**
 * IKOSH application-level domain constants.
 *
 * These are intentionally separate from DigitAuth authentication roles
 * (`USER`, `MODERATOR`, `ADMIN`, `SUPER_ADMIN`): DigitAuth only establishes
 * identity; IKOSH roles describe employment responsibility inside this
 * application and are stored exclusively on the MongoDB user record.
 */

export const IKOSH_ROLES = [
  "EMPLOYEE",
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
] as const;

export type IkoshRole = (typeof IKOSH_ROLES)[number];

export function isIkoshRole(value: unknown): value is IkoshRole {
  return (
    typeof value === "string" &&
    (IKOSH_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Roles allowed to view sensitive employment and administrative information
 * about other employees (hire date, employment type, manager, IKOSH role,
 * active status). Ordinary employees only see basic contact information.
 *
 * HSE_MANAGER is included because HSE operations (incident reporting,
 * investigations, site assignments) require identifying the personnel
 * involved.
 */
export function isManagementRole(role: string): boolean {
  return (
    role === "SUPERVISOR" ||
    role === "HSE_OFFICER" ||
    role === "HSE_MANAGER" ||
    role === "ADMIN"
  );
}

/**
 * Roles allowed to manage HSE operational records (projects, sites,
 * contractors, and later incidents/CAPA workflows). ADMIN covers platform
 * administration; HSE_MANAGER owns day-to-day HSE operations. HSE_OFFICER is
 * a field role: officers report and investigate but do not administer this
 * reference data.
 */
export function isHseManagementRole(role: string): boolean {
  return role === "HSE_MANAGER" || role === "ADMIN";
}

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export function isEmploymentType(
  value: unknown,
): value is EmploymentType {
  return (
    typeof value === "string" &&
    (EMPLOYMENT_TYPES as readonly string[]).includes(value)
  );
}
