import {
  AUDIT_CHECKLIST_RESULTS,
  AUDIT_STATUSES,
  AUDIT_TYPES,
  type AuditChecklistItem,
  type AuditChecklistResult,
  type AuditFindingSeverity,
  type AuditStatus,
  type AuditType,
} from "./api/types";

/**
 * Pure URL-state, workflow and checklist helpers for HSE audits.
 *
 * Filter state lives in the query string so a filtered register is shareable
 * and survives refreshes. The API remains authoritative for scoping, status
 * transitions, checklist edits and findings.
 */

export const AUDIT_PAGE_SIZE = 20;
export const MAX_AUDIT_PAGE_SIZE = 100;
export const MAX_AUDIT_SEARCH_LENGTH = 200;

export interface AuditFilterState {
  q: string;
  status: AuditStatus | "";
  type: AuditType | "";
  siteId: string;
  auditorId: string;
  page: number;
  limit: number;
}

export const EMPTY_AUDIT_FILTERS: AuditFilterState = {
  q: "",
  status: "",
  type: "",
  siteId: "",
  auditorId: "",
  page: 1,
  limit: AUDIT_PAGE_SIZE,
};

/** Lifecycle mirrored from the server. COMPLETED and CANCELLED are terminal. */
export const AUDIT_STATUS_TRANSITIONS: Record<
  AuditStatus,
  readonly AuditStatus[]
> = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function nextAuditStatuses(
  status: AuditStatus,
): readonly AuditStatus[] {
  return AUDIT_STATUS_TRANSITIONS[status];
}

export function isAuditTerminal(status: AuditStatus): boolean {
  return AUDIT_STATUS_TRANSITIONS[status].length === 0;
}

/** Checklist results, findings and evidence may only be added while open. */
export function isAuditOpen(status: AuditStatus): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS";
}

export function auditDetailHref(auditId: string): string {
  return `/audits/${auditId}`;
}

/** Severity ordering used to highlight the most serious findings first. */
export const AUDIT_SEVERITY_RANK: Record<AuditFindingSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function compareAuditSeverity(
  left: AuditFindingSeverity,
  right: AuditFindingSeverity,
): number {
  return AUDIT_SEVERITY_RANK[right] - AUDIT_SEVERITY_RANK[left];
}

export interface AuditChecklistProgress {
  total: number;
  assessed: number;
  compliant: number;
  nonCompliant: number;
  notApplicable: number;
}

/** Counts checklist outcomes for the progress summary. */
export function auditChecklistProgress(
  checklist: readonly Pick<AuditChecklistItem, "result">[],
): AuditChecklistProgress {
  return checklist.reduce<AuditChecklistProgress>(
    (progress, item) => {
      if (item.result !== "PENDING") {
        progress.assessed += 1;
      }

      if (item.result === "COMPLIANT") progress.compliant += 1;
      if (item.result === "NON_COMPLIANT") progress.nonCompliant += 1;
      if (item.result === "NOT_APPLICABLE") progress.notApplicable += 1;

      return progress;
    },
    {
      total: checklist.length,
      assessed: 0,
      compliant: 0,
      nonCompliant: 0,
      notApplicable: 0,
    },
  );
}

/** An audit is overdue when its scheduled date passed while still open. */
export function isAuditOverdue(
  audit: { scheduledFor: string; status: AuditStatus },
  now: number = Date.now(),
): boolean {
  if (!isAuditOpen(audit.status)) {
    return false;
  }

  const scheduled = new Date(audit.scheduledFor).getTime();

  return Number.isFinite(scheduled) && scheduled < now;
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isAuditStatus(value: unknown): value is AuditStatus {
  return (
    typeof value === "string" &&
    (AUDIT_STATUSES as readonly string[]).includes(value)
  );
}

function isAuditType(value: unknown): value is AuditType {
  return (
    typeof value === "string" &&
    (AUDIT_TYPES as readonly string[]).includes(value)
  );
}

export function isAuditChecklistResult(
  value: unknown,
): value is AuditChecklistResult {
  return (
    typeof value === "string" &&
    (AUDIT_CHECKLIST_RESULTS as readonly string[]).includes(value)
  );
}

function objectIdOrEmpty(value: string | null): string {
  return value !== null && OBJECT_ID_PATTERN.test(value) ? value : "";
}

/** Parses register filters, falling back safely for malformed URL values. */
export function parseAuditFilters(
  searchParams: URLSearchParams,
): AuditFilterState {
  const rawStatus = searchParams.get("status");
  const rawType = searchParams.get("type");
  const rawQuery = (searchParams.get("q") ?? "").trim();

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(AUDIT_PAGE_SIZE),
    10,
  );

  return {
    q: rawQuery.slice(0, MAX_AUDIT_SEARCH_LENGTH),
    status: isAuditStatus(rawStatus) ? rawStatus : "",
    type: isAuditType(rawType) ? rawType : "",
    siteId: objectIdOrEmpty(searchParams.get("siteId")),
    auditorId: objectIdOrEmpty(searchParams.get("auditorId")),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) &&
      limit >= 1 &&
      limit <= MAX_AUDIT_PAGE_SIZE
        ? limit
        : AUDIT_PAGE_SIZE,
  };
}

/** Builds shareable URL state, omitting defaults. */
export function buildAuditFilterSearchParams(
  filters: AuditFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q) searchParams.set("q", filters.q);
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.type) searchParams.set("type", filters.type);
  if (filters.siteId) searchParams.set("siteId", filters.siteId);
  if (filters.auditorId) searchParams.set("auditorId", filters.auditorId);
  if (filters.page > 1) searchParams.set("page", String(filters.page));
  if (filters.limit !== AUDIT_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActiveAuditFilters(filters: AuditFilterState): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.type ||
      filters.siteId ||
      filters.auditorId,
  );
}
