import {
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  type InspectionSeverity,
  type InspectionStatus,
  type InspectionType,
} from "./api/types";

/**
 * Pure URL-state and workflow helpers for the inspection register.
 *
 * Filter state lives in the query string so a filtered register is shareable
 * and survives refreshes. The API remains authoritative for scoping, status
 * transitions and who may conduct an inspection.
 */

export const INSPECTION_PAGE_SIZE = 20;
export const MAX_INSPECTION_PAGE_SIZE = 100;
export const MAX_INSPECTION_SEARCH_LENGTH = 200;

export interface InspectionFilterState {
  q: string;
  status: InspectionStatus | "";
  type: InspectionType | "";
  siteId: string;
  inspectorId: string;
  page: number;
  limit: number;
}

export const EMPTY_INSPECTION_FILTERS: InspectionFilterState = {
  q: "",
  status: "",
  type: "",
  siteId: "",
  inspectorId: "",
  page: 1,
  limit: INSPECTION_PAGE_SIZE,
};

/** Forward-only lifecycle mirrored from the server. */
export const INSPECTION_STATUS_TRANSITIONS: Record<
  InspectionStatus,
  readonly InspectionStatus[]
> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function nextInspectionStatuses(
  status: InspectionStatus,
): readonly InspectionStatus[] {
  return INSPECTION_STATUS_TRANSITIONS[status];
}

export function isInspectionTerminal(status: InspectionStatus): boolean {
  return INSPECTION_STATUS_TRANSITIONS[status].length === 0;
}

/** Findings and evidence may only be added while an inspection is open. */
export function isInspectionOpen(status: InspectionStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}

export function inspectionDetailHref(inspectionId: string): string {
  return `/inspections/${inspectionId}`;
}

/** Severity ordering used to highlight the most serious findings first. */
export const INSPECTION_SEVERITY_RANK: Record<InspectionSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function compareInspectionSeverity(
  left: InspectionSeverity,
  right: InspectionSeverity,
): number {
  return INSPECTION_SEVERITY_RANK[right] - INSPECTION_SEVERITY_RANK[left];
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isInspectionStatus(value: unknown): value is InspectionStatus {
  return (
    typeof value === "string" &&
    (INSPECTION_STATUSES as readonly string[]).includes(value)
  );
}

function isInspectionType(value: unknown): value is InspectionType {
  return (
    typeof value === "string" &&
    (INSPECTION_TYPES as readonly string[]).includes(value)
  );
}

function objectIdOrEmpty(value: string | null): string {
  return value !== null && OBJECT_ID_PATTERN.test(value) ? value : "";
}

/** Parses register filters, falling back safely for malformed URL values. */
export function parseInspectionFilters(
  searchParams: URLSearchParams,
): InspectionFilterState {
  const rawStatus = searchParams.get("status");
  const rawType = searchParams.get("type");
  const rawQuery = (searchParams.get("q") ?? "").trim();

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(INSPECTION_PAGE_SIZE),
    10,
  );

  return {
    q: rawQuery.slice(0, MAX_INSPECTION_SEARCH_LENGTH),
    status: isInspectionStatus(rawStatus) ? rawStatus : "",
    type: isInspectionType(rawType) ? rawType : "",
    siteId: objectIdOrEmpty(searchParams.get("siteId")),
    inspectorId: objectIdOrEmpty(searchParams.get("inspectorId")),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) &&
      limit >= 1 &&
      limit <= MAX_INSPECTION_PAGE_SIZE
        ? limit
        : INSPECTION_PAGE_SIZE,
  };
}

/** Builds shareable URL state, omitting defaults. */
export function buildInspectionFilterSearchParams(
  filters: InspectionFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q) searchParams.set("q", filters.q);
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.type) searchParams.set("type", filters.type);
  if (filters.siteId) searchParams.set("siteId", filters.siteId);
  if (filters.inspectorId) searchParams.set("inspectorId", filters.inspectorId);
  if (filters.page > 1) searchParams.set("page", String(filters.page));
  if (filters.limit !== INSPECTION_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActiveInspectionFilters(
  filters: InspectionFilterState,
): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.type ||
      filters.siteId ||
      filters.inspectorId,
  );
}

/** An inspection is overdue when its scheduled date passed while still open. */
export function isInspectionOverdue(
  inspection: { scheduledFor: string; status: InspectionStatus },
  now: number = Date.now(),
): boolean {
  if (!isInspectionOpen(inspection.status)) {
    return false;
  }

  const scheduled = new Date(inspection.scheduledFor).getTime();

  return Number.isFinite(scheduled) && scheduled < now;
}
