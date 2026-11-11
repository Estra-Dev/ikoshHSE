import { isIkoshRole, type IkoshRole } from "./ikosh-constants.js";

/**
 * HSE capabilities used by Phase 1 routes and future workflows.
 *
 * Authorization is always evaluated against the IKOSH employee record
 * (`req.ikoshUser.ikoshRole`), never against a DigitAuth role.
 */
export const HSE_CAPABILITIES = [
  "reportIncident",
  "viewAllSites",
  "manageHseRecords",
  "classifyIncidents",
  "progressIncidentStatus",
  "viewAuditLog",
  "manageEmployees",
  "manageDepartments",
] as const;

export type HseCapability = (typeof HSE_CAPABILITIES)[number];

const ROLE_MATRIX: Record<IkoshRole, readonly HseCapability[]> = {
  EMPLOYEE: ["reportIncident"],
  SUPERVISOR: ["reportIncident"],
  HSE_OFFICER: ["reportIncident"],
  HSE_MANAGER: [
    "reportIncident",
    "viewAllSites",
    "manageHseRecords",
    "classifyIncidents",
    "progressIncidentStatus",
    "viewAuditLog",
  ],
  ADMIN: HSE_CAPABILITIES,
};

/** Returns false for unknown roles so callers fail closed. */
export function hasHsePermission(
  role: string,
  capability: HseCapability,
): boolean {
  return isIkoshRole(role) && ROLE_MATRIX[role].includes(capability);
}

export function canReportIncident(role: string): boolean {
  return hasHsePermission(role, "reportIncident");
}

export function canViewAllSites(role: string): boolean {
  return hasHsePermission(role, "viewAllSites");
}

export function canManageHseRecords(role: string): boolean {
  return hasHsePermission(role, "manageHseRecords");
}

export function canClassifyIncidents(role: string): boolean {
  return hasHsePermission(role, "classifyIncidents");
}

export function canProgressIncidentStatus(role: string): boolean {
  return hasHsePermission(role, "progressIncidentStatus");
}

export function canViewAuditLog(role: string): boolean {
  return hasHsePermission(role, "viewAuditLog");
}

export function canManageEmployees(role: string): boolean {
  return hasHsePermission(role, "manageEmployees");
}

export function canManageDepartments(role: string): boolean {
  return hasHsePermission(role, "manageDepartments");
}
