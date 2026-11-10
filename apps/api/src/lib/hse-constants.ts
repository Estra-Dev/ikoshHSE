/**
 * HSE domain reference data.
 *
 * These lists are the single source of truth for classification values used
 * by HSE workflows (incidents, permits, environmental records). Phase 1
 * exposes them through `/api/hse/reference` so reporting forms stay in sync
 * with the server; Phase 2+ models and validation schemas consume them
 * directly.
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
 * Incident and near-miss categories. Classification happens during
 * investigation (Phase 2 workflow), never at reporting time: the initial
 * report only needs to be fast.
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
