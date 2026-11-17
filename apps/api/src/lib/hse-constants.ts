/**
 * HSE domain reference data.
 *
 * These lists are the single source of truth for classification values used
 * by HSE workflows (incidents, permits, environmental records). Phase 1
 * exposes them through `/api/hse/reference` so reporting forms stay in sync
 * with the server, and incident models/validation consume them directly.
 *
 * Values are deliberately stable, uppercase codes rather than free text:
 * they are stored on records, filtered on, and used in KPI formulas, so they
 * must never be renamed once data exists. Display labels belong to the web
 * client.
 */

/** Lifecycle status of an EPC project. */
export const PROJECT_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(value)
  );
}

/** Lifecycle status of a physical work site. */
export const SITE_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "DECOMMISSIONED",
] as const;

export type SiteStatus = (typeof SITE_STATUSES)[number];

export function isSiteStatus(value: unknown): value is SiteStatus {
  return (
    typeof value === "string" &&
    (SITE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Incident and near-miss categories. Classification is management-controlled
 * and happens after reporting; the initial report only needs to be fast.
 */
export const INCIDENT_CATEGORIES = [
  "FATALITY",
  "LOST_TIME_INJURY",
  "RESTRICTED_WORK_CASE",
  "MEDICAL_TREATMENT_CASE",
  "FIRST_AID_CASE",
  "NEAR_MISS",
  "PROPERTY_DAMAGE",
  "ENVIRONMENTAL_INCIDENT",
  "FIRE_OR_EXPLOSION",
  "VEHICLE_INCIDENT",
  "PROCESS_SAFETY_EVENT",
  "SECURITY_INCIDENT",
  "OTHER",
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export function isIncidentCategory(
  value: unknown,
): value is IncidentCategory {
  return (
    typeof value === "string" &&
    (INCIDENT_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Incident workflow status. Reports start as REPORTED; HSE management only
 * may move them through TRIAGED to CLOSED.
 */
export const INCIDENT_STATUSES = ["REPORTED", "TRIAGED", "CLOSED"] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export function isIncidentStatus(value: unknown): value is IncidentStatus {
  return (
    typeof value === "string" &&
    (INCIDENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Incident workflow is strictly forward-only: REPORTED → TRIAGED → CLOSED.
 * Reopening or skipping a stage is rejected.
 */
export const INCIDENT_STATUS_TRANSITIONS: Record<
  IncidentStatus,
  readonly IncidentStatus[]
> = {
  REPORTED: ["TRIAGED"],
  TRIAGED: ["CLOSED"],
  CLOSED: [],
};

export function canTransitionIncidentStatus(
  from: IncidentStatus,
  to: IncidentStatus,
): boolean {
  return INCIDENT_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Report kind chosen by the reporter. Category classification (including the
 * NEAR_MISS category) is a separate, management-controlled workflow step.
 */
export const INCIDENT_TYPES = ["INCIDENT", "NEAR_MISS"] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export function isIncidentType(value: unknown): value is IncidentType {
  return (
    typeof value === "string" &&
    (INCIDENT_TYPES as readonly string[]).includes(value)
  );
}

/** Body parts affected by an injury (incident investigation data). */
export const INJURED_BODY_PARTS = [
  "HEAD",
  "FACE",
  "EYE",
  "EAR",
  "NECK",
  "SHOULDER",
  "UPPER_ARM",
  "ELBOW",
  "FOREARM",
  "WRIST",
  "HAND",
  "FINGER",
  "CHEST",
  "ABDOMEN",
  "BACK",
  "PELVIS",
  "HIP",
  "THIGH",
  "KNEE",
  "LOWER_LEG",
  "ANKLE",
  "FOOT",
  "TOE",
  "INTERNAL",
  "MULTIPLE",
  "NONE",
] as const;

export type InjuredBodyPart = (typeof INJURED_BODY_PARTS)[number];

export function isInjuredBodyPart(
  value: unknown,
): value is InjuredBodyPart {
  return (
    typeof value === "string" &&
    (INJURED_BODY_PARTS as readonly string[]).includes(value)
  );
}

/** Permit-to-work types (permit workflows arrive in a later phase). */
export const PERMIT_TO_WORK_TYPES = [
  "HOT_WORK",
  "COLD_WORK",
  "CONFINED_SPACE_ENTRY",
  "WORKING_AT_HEIGHT",
  "ELECTRICAL_WORK",
  "EXCAVATION",
  "LIFTING_OPERATION",
  "ENERGY_ISOLATION",
  "RADIOGRAPHY",
  "PRESSURE_TEST",
  "OTHER",
] as const;

export type PermitToWorkType = (typeof PERMIT_TO_WORK_TYPES)[number];

export function isPermitToWorkType(
  value: unknown,
): value is PermitToWorkType {
  return (
    typeof value === "string" &&
    (PERMIT_TO_WORK_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Permit-to-work lifecycle. A permit is drafted, submitted for review,
 * approved, then activated inside its validity window. An active permit may be
 * suspended and resumed, and is finally closed. REJECTED and CANCELLED are
 * terminal alternatives.
 */
export const PERMIT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;

export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export function isPermitStatus(value: unknown): value is PermitStatus {
  return (
    typeof value === "string" &&
    (PERMIT_STATUSES as readonly string[]).includes(value)
  );
}

export const PERMIT_STATUS_TRANSITIONS: Record<
  PermitStatus,
  readonly PermitStatus[]
> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "CLOSED"],
  // Resuming returns the permit to ACTIVE; `resumedBy`/`resumedAt` preserve
  // the fact that it was suspended in between.
  SUSPENDED: ["ACTIVE", "CLOSED"],
  CLOSED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransitionPermitStatus(
  from: PermitStatus,
  to: PermitStatus,
): boolean {
  return PERMIT_STATUS_TRANSITIONS[from].includes(to);
}

/** Terminal permit statuses accept no further workflow or evidence. */
export const PERMIT_TERMINAL_STATUSES = [
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;

export type PermitTerminalStatus = (typeof PERMIT_TERMINAL_STATUSES)[number];

export function isPermitTerminalStatus(
  value: unknown,
): value is PermitTerminalStatus {
  return (
    typeof value === "string" &&
    (PERMIT_TERMINAL_STATUSES as readonly string[]).includes(value)
  );
}

/** Stable precaution codes required before hazardous work may start. */
export const PERMIT_PRECAUTIONS = [
  "PPE",
  "GAS_TESTING",
  "FIRE_WATCH",
  "BARRICADING",
  "LOCKOUT_TAGOUT",
  "SUPERVISION",
  "VENTILATION",
  "RESCUE_PLAN",
  "EMERGENCY_RESPONSE",
  "TOOLBOX_TALK",
  "OTHER",
] as const;

export type PermitPrecaution = (typeof PERMIT_PRECAUTIONS)[number];

export function isPermitPrecaution(value: unknown): value is PermitPrecaution {
  return (
    typeof value === "string" &&
    (PERMIT_PRECAUTIONS as readonly string[]).includes(value)
  );
}

/**
 * Active personnel that may be responsible for a permit. The route additionally
 * requires that the person is authorised for the permit's site.
 */
export const PERMIT_RESPONSIBLE_ROLES = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
] as const;

export type PermitResponsibleRole = (typeof PERMIT_RESPONSIBLE_ROLES)[number];

export function isPermitResponsibleRole(
  value: unknown,
): value is PermitResponsibleRole {
  return (
    typeof value === "string" &&
    (PERMIT_RESPONSIBLE_ROLES as readonly string[]).includes(value)
  );
}

/** Fields that must be confirmed before an active permit can be closed. */
export const PERMIT_CLOSURE_CHECKS = [
  "workAreaSecured",
  "personnelAccountedFor",
  "equipmentIsolated",
  "siteHandoverCompleted",
] as const;

export type PermitClosureCheck = (typeof PERMIT_CLOSURE_CHECKS)[number];

/** Waste classification (environmental records arrive in a later phase). */
export const WASTE_TYPES = [
  "DOMESTIC",
  "INDUSTRIAL",
  "HAZARDOUS",
  "RECYCLABLE",
  "BIOMEDICAL",
  "CONSTRUCTION_DEBRIS",
  "OILY",
  "CHEMICAL",
  "ELECTRONIC",
  "SCRAP_METAL",
] as const;

export type WasteType = (typeof WASTE_TYPES)[number];

export function isWasteType(value: unknown): value is WasteType {
  return (
    typeof value === "string" &&
    (WASTE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Corrective action origin. Incident and near-miss sources must reference the
 * originating report so provenance can never be rewritten later. INSPECTION
 * actions are only created through an inspection finding so the source
 * inspection and finding cannot be forged.
 */
export const CORRECTIVE_ACTION_SOURCES = [
  "INCIDENT",
  "NEAR_MISS",
  "HSE_OBSERVATION",
  "INSPECTION",
  "HSE_AUDIT",
  "OTHER",
] as const;

export type CorrectiveActionSource =
  (typeof CORRECTIVE_ACTION_SOURCES)[number];

export function isCorrectiveActionSource(
  value: unknown,
): value is CorrectiveActionSource {
  return (
    typeof value === "string" &&
    (CORRECTIVE_ACTION_SOURCES as readonly string[]).includes(value)
  );
}

/**
 * Corrective action workflow. Actions start OPEN and move forward through
 * IN_PROGRESS and COMPLETED to VERIFIED; there is no reopen flow in the MVP.
 */
export const CORRECTIVE_ACTION_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "VERIFIED",
] as const;

export type CorrectiveActionStatus =
  (typeof CORRECTIVE_ACTION_STATUSES)[number];

export function isCorrectiveActionStatus(
  value: unknown,
): value is CorrectiveActionStatus {
  return (
    typeof value === "string" &&
    (CORRECTIVE_ACTION_STATUSES as readonly string[]).includes(value)
  );
}

export const CORRECTIVE_ACTION_STATUS_TRANSITIONS: Record<
  CorrectiveActionStatus,
  readonly CorrectiveActionStatus[]
> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: ["VERIFIED"],
  VERIFIED: [],
};

export function canTransitionCorrectiveActionStatus(
  from: CorrectiveActionStatus,
  to: CorrectiveActionStatus,
): boolean {
  return CORRECTIVE_ACTION_STATUS_TRANSITIONS[from].includes(to);
}

/** Roles that may be assigned responsibility for a corrective action. */
export const CORRECTIVE_ACTION_ASSIGNABLE_ROLES = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
] as const;

export type CorrectiveActionAssignableRole =
  (typeof CORRECTIVE_ACTION_ASSIGNABLE_ROLES)[number];

export function isCorrectiveActionAssignableRole(
  value: unknown,
): value is CorrectiveActionAssignableRole {
  return (
    typeof value === "string" &&
    (CORRECTIVE_ACTION_ASSIGNABLE_ROLES as readonly string[]).includes(value)
  );
}

/** Planned inspection purpose. Kept stable because records filter on it. */
export const INSPECTION_TYPES = [
  "ROUTINE",
  "FOCUSED",
  "FOLLOW_UP",
] as const;

export type InspectionType = (typeof INSPECTION_TYPES)[number];

export function isInspectionType(value: unknown): value is InspectionType {
  return (
    typeof value === "string" &&
    (INSPECTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Inspection lifecycle. Inspections are scheduled ahead of time, conducted on
 * site, and completed with a record of findings. CANCELLED is a terminal
 * management decision for inspections that will not take place.
 */
export const INSPECTION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export function isInspectionStatus(value: unknown): value is InspectionStatus {
  return (
    typeof value === "string" &&
    (INSPECTION_STATUSES as readonly string[]).includes(value)
  );
}

export const INSPECTION_STATUS_TRANSITIONS: Record<
  InspectionStatus,
  readonly InspectionStatus[]
> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionInspectionStatus(
  from: InspectionStatus,
  to: InspectionStatus,
): boolean {
  return INSPECTION_STATUS_TRANSITIONS[from].includes(to);
}

/** Finding severity used to prioritise follow-up action. */
export const INSPECTION_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type InspectionSeverity = (typeof INSPECTION_SEVERITIES)[number];

export function isInspectionSeverity(
  value: unknown,
): value is InspectionSeverity {
  return (
    typeof value === "string" &&
    (INSPECTION_SEVERITIES as readonly string[]).includes(value)
  );
}

/** Active HSE personnel that may be responsible for conducting an inspection. */
export const INSPECTION_ASSIGNABLE_ROLES = [
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
] as const;

export type InspectionAssignableRole =
  (typeof INSPECTION_ASSIGNABLE_ROLES)[number];

export function isInspectionAssignableRole(
  value: unknown,
): value is InspectionAssignableRole {
  return (
    typeof value === "string" &&
    (INSPECTION_ASSIGNABLE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Risk assessment lifecycle. Assessments are authored as DRAFT, submitted for
 * review, then approved by HSE management. Returning to DRAFT is an explicit
 * management action so a reviewer can request changes. ARCHIVED is terminal.
 */
export const RISK_ASSESSMENT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const;

export type RiskAssessmentStatus =
  (typeof RISK_ASSESSMENT_STATUSES)[number];

export function isRiskAssessmentStatus(
  value: unknown,
): value is RiskAssessmentStatus {
  return (
    typeof value === "string" &&
    (RISK_ASSESSMENT_STATUSES as readonly string[]).includes(value)
  );
}

export const RISK_ASSESSMENT_STATUS_TRANSITIONS: Record<
  RiskAssessmentStatus,
  readonly RiskAssessmentStatus[]
> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionRiskAssessmentStatus(
  from: RiskAssessmentStatus,
  to: RiskAssessmentStatus,
): boolean {
  return RISK_ASSESSMENT_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Server-derived risk bands for the 5×5 matrix. Clients submit likelihood and
 * severity only; the level is always recomputed so it cannot be forged.
 */
export const RISK_LEVELS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export function isRiskLevel(value: unknown): value is RiskLevel {
  return (
    typeof value === "string" &&
    (RISK_LEVELS as readonly string[]).includes(value)
  );
}

/** Maps a 1–25 likelihood × severity score onto a stable risk band. */
export function riskLevelFor(likelihood: number, severity: number): RiskLevel {
  const score = likelihood * severity;

  if (score <= 4) {
    return "LOW";
  }

  if (score <= 9) {
    return "MEDIUM";
  }

  if (score <= 14) {
    return "HIGH";
  }

  return "CRITICAL";
}

/** Active personnel that may own a risk assessment or hazard control. */
export const RISK_RESPONSIBLE_ROLES = [
  "SUPERVISOR",
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
] as const;

export type RiskResponsibleRole = (typeof RISK_RESPONSIBLE_ROLES)[number];

export function isRiskResponsibleRole(
  value: unknown,
): value is RiskResponsibleRole {
  return (
    typeof value === "string" &&
    (RISK_RESPONSIBLE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * HSE audit kind. Kept stable because records filter and report on it.
 */
export const AUDIT_TYPES = [
  "INTERNAL",
  "EXTERNAL",
  "SUPPLIER",
  "CERTIFICATION",
] as const;

export type AuditType = (typeof AUDIT_TYPES)[number];

export function isAuditType(value: unknown): value is AuditType {
  return (
    typeof value === "string" &&
    (AUDIT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Audit lifecycle. Audits are planned ahead of time, conducted on site, and
 * completed with a record of checklist results and findings. CANCELLED is a
 * terminal management decision for audits that will not take place.
 */
export const AUDIT_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export function isAuditStatus(value: unknown): value is AuditStatus {
  return (
    typeof value === "string" &&
    (AUDIT_STATUSES as readonly string[]).includes(value)
  );
}

export const AUDIT_STATUS_TRANSITIONS: Record<
  AuditStatus,
  readonly AuditStatus[]
> = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionAuditStatus(
  from: AuditStatus,
  to: AuditStatus,
): boolean {
  return AUDIT_STATUS_TRANSITIONS[from].includes(to);
}

/** Outcome recorded against one checklist question. */
export const AUDIT_CHECKLIST_RESULTS = [
  "PENDING",
  "COMPLIANT",
  "NON_COMPLIANT",
  "NOT_APPLICABLE",
] as const;

export type AuditChecklistResult = (typeof AUDIT_CHECKLIST_RESULTS)[number];

export function isAuditChecklistResult(
  value: unknown,
): value is AuditChecklistResult {
  return (
    typeof value === "string" &&
    (AUDIT_CHECKLIST_RESULTS as readonly string[]).includes(value)
  );
}

/** Severity used to prioritise follow-up action for an audit finding. */
export const AUDIT_FINDING_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type AuditFindingSeverity = (typeof AUDIT_FINDING_SEVERITIES)[number];

export function isAuditFindingSeverity(
  value: unknown,
): value is AuditFindingSeverity {
  return (
    typeof value === "string" &&
    (AUDIT_FINDING_SEVERITIES as readonly string[]).includes(value)
  );
}

/** Active HSE personnel that may conduct or be assigned to an audit. */
export const AUDIT_AUDITOR_ROLES = [
  "HSE_OFFICER",
  "HSE_MANAGER",
  "ADMIN",
] as const;

export type AuditAuditorRole = (typeof AUDIT_AUDITOR_ROLES)[number];

export function isAuditAuditorRole(value: unknown): value is AuditAuditorRole {
  return (
    typeof value === "string" &&
    (AUDIT_AUDITOR_ROLES as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* HSE training                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Training course categories. Courses are a small, global catalogue so sessions
 * and personnel history can be grouped consistently. Codes are stable because
 * historical records filter on them.
 */
export const TRAINING_COURSE_CATEGORIES = [
  "INDUCTION",
  "PPE",
  "WORK_AT_HEIGHT",
  "CONFINED_SPACE",
  "FIRE_SAFETY",
  "FIRST_AID",
  "PERMIT_TO_WORK",
  "ENVIRONMENTAL",
  "DRIVING",
  "OTHER",
] as const;

export type TrainingCourseCategory =
  (typeof TRAINING_COURSE_CATEGORIES)[number];

export function isTrainingCourseCategory(
  value: unknown,
): value is TrainingCourseCategory {
  return (
    typeof value === "string" &&
    (TRAINING_COURSE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Attendance-record lifecycle shared by training sessions and toolbox talks.
 * A record is scheduled, then either completed or cancelled. Both terminal
 * states lock the content and participant evidence.
 */
export const ATTENDANCE_RECORD_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type AttendanceRecordStatus =
  (typeof ATTENDANCE_RECORD_STATUSES)[number];

export function isAttendanceRecordStatus(
  value: unknown,
): value is AttendanceRecordStatus {
  return (
    typeof value === "string" &&
    (ATTENDANCE_RECORD_STATUSES as readonly string[]).includes(value)
  );
}

export const ATTENDANCE_RECORD_TRANSITIONS: Record<
  AttendanceRecordStatus,
  readonly AttendanceRecordStatus[]
> = {
  SCHEDULED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionAttendanceRecordStatus(
  from: AttendanceRecordStatus,
  to: AttendanceRecordStatus,
): boolean {
  return ATTENDANCE_RECORD_TRANSITIONS[from].includes(to);
}

export function isAttendanceRecordTerminalStatus(
  value: unknown,
): value is Exclude<AttendanceRecordStatus, "SCHEDULED"> {
  return value === "COMPLETED" || value === "CANCELLED";
}

export const TRAINING_SESSION_STATUSES = ATTENDANCE_RECORD_STATUSES;
export type TrainingSessionStatus = AttendanceRecordStatus;
export const isTrainingSessionStatus = isAttendanceRecordStatus;
export const canTransitionTrainingSessionStatus =
  canTransitionAttendanceRecordStatus;
export const isTrainingSessionTerminalStatus =
  isAttendanceRecordTerminalStatus;

/* -------------------------------------------------------------------------- */
/* Toolbox talks                                                              */
/* -------------------------------------------------------------------------- */

export const TOOLBOX_TALK_STATUSES = ATTENDANCE_RECORD_STATUSES;
export type ToolboxTalkStatus = AttendanceRecordStatus;
export const isToolboxTalkStatus = isAttendanceRecordStatus;
export const canTransitionToolboxTalkStatus =
  canTransitionAttendanceRecordStatus;
export const isToolboxTalkTerminalStatus = isAttendanceRecordTerminalStatus;

/* -------------------------------------------------------------------------- */
/* Participants                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Participants are references to existing workforce records, never a new
 * directory. Employees and contractor personnel stay distinct so the two
 * populations can be reported on without cross-contamination.
 */
export const WORKFORCE_PARTICIPANT_KINDS = ["EMPLOYEE", "CONTRACTOR"] as const;

export type WorkforceParticipantKind =
  (typeof WORKFORCE_PARTICIPANT_KINDS)[number];

export function isWorkforceParticipantKind(
  value: unknown,
): value is WorkforceParticipantKind {
  return (
    typeof value === "string" &&
    (WORKFORCE_PARTICIPANT_KINDS as readonly string[]).includes(value)
  );
}

/** Attendance recorded for a participant on a session or talk. */
export const PARTICIPANT_ATTENDANCE_STATES = [
  "INVITED",
  "ATTENDED",
  "ABSENT",
] as const;

export type ParticipantAttendanceState =
  (typeof PARTICIPANT_ATTENDANCE_STATES)[number];

export function isParticipantAttendanceState(
  value: unknown,
): value is ParticipantAttendanceState {
  return (
    typeof value === "string" &&
    (PARTICIPANT_ATTENDANCE_STATES as readonly string[]).includes(value)
  );
}
