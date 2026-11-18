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
  "viewCorrectiveActions",
  "createCorrectiveActions",
  "manageCorrectiveActions",
  "progressCorrectiveActions",
  "viewInspections",
  "createInspections",
  "conductInspections",
  "manageInspections",
  "viewRiskAssessments",
  "createRiskAssessments",
  "editRiskAssessments",
  "manageRiskAssessments",
  "viewAudits",
  "createAudits",
  "conductAudits",
  "manageAudits",
  "viewPermits",
  "createPermits",
  "operatePermits",
  "managePermits",
  "approvePermits",
  "viewTraining",
  "createTraining",
  "manageTraining",
  "viewToolboxTalks",
  "createToolboxTalks",
  "manageToolboxTalks",
  "viewAuditLog",
  "viewReports",
  "viewPpe",
  "issuePpe",
  "managePpeStock",
  "managePpeCatalogue",
  "manageEmployees",
  "manageDepartments",
] as const;

export type HseCapability = (typeof HSE_CAPABILITIES)[number];

const ROLE_MATRIX: Record<IkoshRole, readonly HseCapability[]> = {
  EMPLOYEE: ["reportIncident"],
  SUPERVISOR: [
    "reportIncident",
    "viewCorrectiveActions",
    "viewInspections",
    "viewRiskAssessments",
    "viewAudits",
    "viewPermits",
    "createPermits",
    "operatePermits",
    "viewTraining",
    "viewToolboxTalks",
    "createToolboxTalks",
    "viewReports",
    "viewPpe",
    "issuePpe",
  ],
  HSE_OFFICER: [
    "reportIncident",
    "viewCorrectiveActions",
    "createCorrectiveActions",
    "progressCorrectiveActions",
    "viewInspections",
    "createInspections",
    "conductInspections",
    "viewRiskAssessments",
    "createRiskAssessments",
    "editRiskAssessments",
    "viewAudits",
    "createAudits",
    "conductAudits",
    "viewPermits",
    "createPermits",
    "operatePermits",
    "viewTraining",
    "createTraining",
    "viewToolboxTalks",
    "createToolboxTalks",
    "viewReports",
    "viewPpe",
    "issuePpe",
    "managePpeStock",
  ],
  HSE_MANAGER: [
    "reportIncident",
    "viewAllSites",
    "manageHseRecords",
    "classifyIncidents",
    "progressIncidentStatus",
    "viewCorrectiveActions",
    "createCorrectiveActions",
    "manageCorrectiveActions",
    "progressCorrectiveActions",
    "viewInspections",
    "createInspections",
    "conductInspections",
    "manageInspections",
    "viewRiskAssessments",
    "createRiskAssessments",
    "editRiskAssessments",
    "manageRiskAssessments",
    "viewAudits",
    "createAudits",
    "conductAudits",
    "manageAudits",
    "viewPermits",
    "createPermits",
    "operatePermits",
    "managePermits",
    "approvePermits",
    "viewTraining",
    "createTraining",
    "manageTraining",
    "viewToolboxTalks",
    "createToolboxTalks",
    "manageToolboxTalks",
    "viewAuditLog",
    "viewReports",
    "viewPpe",
    "issuePpe",
    "managePpeStock",
    "managePpeCatalogue",
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

export function canViewCorrectiveActions(role: string): boolean {
  return hasHsePermission(role, "viewCorrectiveActions");
}

export function canCreateCorrectiveActions(role: string): boolean {
  return hasHsePermission(role, "createCorrectiveActions");
}

export function canManageCorrectiveActions(role: string): boolean {
  return hasHsePermission(role, "manageCorrectiveActions");
}

export function canProgressCorrectiveActions(role: string): boolean {
  return hasHsePermission(role, "progressCorrectiveActions");
}

export function canViewInspections(role: string): boolean {
  return hasHsePermission(role, "viewInspections");
}

export function canCreateInspections(role: string): boolean {
  return hasHsePermission(role, "createInspections");
}

export function canConductInspections(role: string): boolean {
  return hasHsePermission(role, "conductInspections");
}

export function canManageInspections(role: string): boolean {
  return hasHsePermission(role, "manageInspections");
}

export function canViewRiskAssessments(role: string): boolean {
  return hasHsePermission(role, "viewRiskAssessments");
}

export function canCreateRiskAssessments(role: string): boolean {
  return hasHsePermission(role, "createRiskAssessments");
}

export function canEditRiskAssessments(role: string): boolean {
  return hasHsePermission(role, "editRiskAssessments");
}

/** Approve, return to draft and archive risk assessments. */
export function canManageRiskAssessments(role: string): boolean {
  return hasHsePermission(role, "manageRiskAssessments");
}

export function canViewAudits(role: string): boolean {
  return hasHsePermission(role, "viewAudits");
}

export function canCreateAudits(role: string): boolean {
  return hasHsePermission(role, "createAudits");
}

export function canConductAudits(role: string): boolean {
  return hasHsePermission(role, "conductAudits");
}

export function canManageAudits(role: string): boolean {
  return hasHsePermission(role, "manageAudits");
}

export function canViewPermits(role: string): boolean {
  return hasHsePermission(role, "viewPermits");
}

export function canCreatePermits(role: string): boolean {
  return hasHsePermission(role, "createPermits");
}

/** Submit, activate, suspend, resume, close and upload evidence. */
export function canOperatePermits(role: string): boolean {
  return hasHsePermission(role, "operatePermits");
}

/** Edit permit metadata while draft and cancel approved permits. */
export function canManagePermits(role: string): boolean {
  return hasHsePermission(role, "managePermits");
}

/** Approve or reject submitted permits. */
export function canApprovePermits(role: string): boolean {
  return hasHsePermission(role, "approvePermits");
}

/** Read the training register and personnel training history. */
export function canViewTraining(role: string): boolean {
  return hasHsePermission(role, "viewTraining");
}

/** Schedule training sessions and record attendance. */
export function canCreateTraining(role: string): boolean {
  return hasHsePermission(role, "createTraining");
}

/** Create/deactivate courses and manage any training session. */
export function canManageTraining(role: string): boolean {
  return hasHsePermission(role, "manageTraining");
}

/** Read the toolbox talk register and personnel talk history. */
export function canViewToolboxTalks(role: string): boolean {
  return hasHsePermission(role, "viewToolboxTalks");
}

/** Schedule toolbox talks and record attendance. */
export function canCreateToolboxTalks(role: string): boolean {
  return hasHsePermission(role, "createToolboxTalks");
}

/** Manage any toolbox talk and its terminal transitions. */
export function canManageToolboxTalks(role: string): boolean {
  return hasHsePermission(role, "manageToolboxTalks");
}

export function canViewAuditLog(role: string): boolean {
  return hasHsePermission(role, "viewAuditLog");
}

/** Read the cross-module HSE reports. */
export function canViewReports(role: string): boolean {
  return hasHsePermission(role, "viewReports");
}

/** Read the PPE register, stock and personnel PPE history. */
export function canViewPpe(role: string): boolean {
  return hasHsePermission(role, "viewPpe");
}

/** Issue, return, replace and mark PPE lost. */
export function canIssuePpe(role: string): boolean {
  return hasHsePermission(role, "issuePpe");
}

/** Create and adjust per-site PPE stock levels. */
export function canManagePpeStock(role: string): boolean {
  return hasHsePermission(role, "managePpeStock");
}

/** Create and deactivate PPE catalogue items. */
export function canManagePpeCatalogue(role: string): boolean {
  return hasHsePermission(role, "managePpeCatalogue");
}

export function canManageEmployees(role: string): boolean {
  return hasHsePermission(role, "manageEmployees");
}

export function canManageDepartments(role: string): boolean {
  return hasHsePermission(role, "manageDepartments");
}
