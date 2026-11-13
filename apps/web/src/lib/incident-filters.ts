import {
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  type IncidentStatus,
  type IncidentType,
} from "./api/types";

/**
 * Pure URL-state helpers for the incident and near-miss registers.
 *
 * Filter state lives in the query string so a filtered register is shareable
 * and survives refreshes. The near-miss register passes a locked type, which
 * is enforced here rather than trusted from the URL.
 */

export const INCIDENT_PAGE_SIZE = 20;
export const MAX_INCIDENT_PAGE_SIZE = 100;

export interface IncidentFilterState {
  siteId: string;
  status: IncidentStatus | "";
  type: IncidentType | "";
  page: number;
  limit: number;
}

export const EMPTY_INCIDENT_FILTERS: IncidentFilterState = {
  siteId: "",
  status: "",
  type: "",
  page: 1,
  limit: INCIDENT_PAGE_SIZE,
};

export interface IncidentFilterOptions {
  /** Forces a report type and hides the type from URL state. */
  lockedType?: IncidentType;
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isIncidentStatus(value: unknown): value is IncidentStatus {
  return (
    typeof value === "string" &&
    (INCIDENT_STATUSES as readonly string[]).includes(value)
  );
}

function isIncidentType(value: unknown): value is IncidentType {
  return (
    typeof value === "string" &&
    (INCIDENT_TYPES as readonly string[]).includes(value)
  );
}

/** Parses register filters, falling back safely for malformed URL values. */
export function parseIncidentFilters(
  searchParams: URLSearchParams,
  options: IncidentFilterOptions = {},
): IncidentFilterState {
  const rawSiteId = searchParams.get("siteId") ?? "";
  const rawStatus = searchParams.get("status");
  const rawType = searchParams.get("type");

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(INCIDENT_PAGE_SIZE),
    10,
  );

  return {
    siteId: OBJECT_ID_PATTERN.test(rawSiteId) ? rawSiteId : "",
    status: isIncidentStatus(rawStatus) ? rawStatus : "",
    type: options.lockedType ?? (isIncidentType(rawType) ? rawType : ""),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) && limit >= 1 && limit <= MAX_INCIDENT_PAGE_SIZE
        ? limit
        : INCIDENT_PAGE_SIZE,
  };
}

/**
 * Builds shareable URL state. Defaults are omitted, and a locked type is
 * never written to the URL because the route itself owns that constraint.
 */
export function buildIncidentFilterSearchParams(
  filters: IncidentFilterState,
  options: IncidentFilterOptions = {},
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.siteId) {
    searchParams.set("siteId", filters.siteId);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (!options.lockedType && filters.type) {
    searchParams.set("type", filters.type);
  }

  if (filters.page > 1) {
    searchParams.set("page", String(filters.page));
  }

  if (filters.limit !== INCIDENT_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActiveIncidentFilters(
  filters: IncidentFilterState,
  options: IncidentFilterOptions = {},
): boolean {
  return Boolean(
    filters.siteId ||
      filters.status ||
      (!options.lockedType && filters.type),
  );
}
