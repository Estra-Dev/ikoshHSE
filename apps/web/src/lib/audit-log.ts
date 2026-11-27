/**
 * Audit log query helpers. The API accepts exact-match filters on entity type,
 * entity id and action, plus a bounded result limit. Values are validated here
 * so a malformed entity id never reaches the server as a 400.
 */

export const AUDIT_LOG_DEFAULT_LIMIT = 50;
export const AUDIT_LOG_MAX_LIMIT = 100;

export const AUDIT_ENTITY_TYPES = [
  "Incident",
  "CorrectiveAction",
  "Project",
  "Site",
  "Contractor",
  "ContractorPersonnel",
  "ContractorPersonnelSiteAssignment",
  "Attachment",
  "Department",
  "User",
  "RiskAssessment",
  "HseAudit",
  "Permit",
  "ManagementOfChange",
] as const;

export interface AuditLogQueryState {
  entityType: string;
  entityId: string;
  action: string;
  limit: number;
}

export const EMPTY_AUDIT_LOG_QUERY: AuditLogQueryState = {
  entityType: "",
  entityId: "",
  action: "",
  limit: AUDIT_LOG_DEFAULT_LIMIT,
};

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

export function isValidObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value);
}

/**
 * Builds the audit log query. An invalid or partial entity id is omitted
 * rather than sent, because the server rejects non-ObjectId values.
 */
export function buildAuditLogSearchParams(
  query: AuditLogQueryState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  const entityType = query.entityType.trim();
  const action = query.action.trim();
  const entityId = query.entityId.trim();

  if (entityType) searchParams.set("entityType", entityType);
  if (action) searchParams.set("action", action);
  if (entityId && isValidObjectId(entityId)) {
    searchParams.set("entityId", entityId);
  }

  searchParams.set("limit", String(query.limit));

  return searchParams;
}

/** Whether any filter beyond the result limit is active. */
export function hasActiveAuditLogFilters(
  query: AuditLogQueryState,
): boolean {
  return Boolean(query.entityType || query.entityId || query.action);
}
