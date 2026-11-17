import {
  CORRECTIVE_ACTION_SOURCES,
  CORRECTIVE_ACTION_STATUSES,
  type CorrectiveActionSource,
  type CorrectiveActionStatus,
} from "./api/types";

/**
 * Pure URL-state and workflow helpers for the corrective action register.
 *
 * Filter state lives in the query string so a filtered register is shareable
 * and survives refreshes. The API remains authoritative for scoping, status
 * transitions and verification rights.
 */

export const CORRECTIVE_ACTION_PAGE_SIZE = 20;
export const MAX_CORRECTIVE_ACTION_PAGE_SIZE = 100;

export interface CorrectiveActionFilterState {
  siteId: string;
  status: CorrectiveActionStatus | "";
  source: CorrectiveActionSource | "";
  overdue: boolean;
  page: number;
  limit: number;
}

export const EMPTY_CORRECTIVE_ACTION_FILTERS: CorrectiveActionFilterState = {
  siteId: "",
  status: "",
  source: "",
  overdue: false,
  page: 1,
  limit: CORRECTIVE_ACTION_PAGE_SIZE,
};

/** Forward-only lifecycle mirrored from the server. */
export const CORRECTIVE_ACTION_STATUS_TRANSITIONS: Record<
  CorrectiveActionStatus,
  readonly CorrectiveActionStatus[]
> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: ["VERIFIED"],
  VERIFIED: [],
};

export function nextCorrectiveActionStatuses(
  status: CorrectiveActionStatus,
): readonly CorrectiveActionStatus[] {
  return CORRECTIVE_ACTION_STATUS_TRANSITIONS[status];
}

export function isCorrectiveActionTerminal(
  status: CorrectiveActionStatus,
): boolean {
  return CORRECTIVE_ACTION_STATUS_TRANSITIONS[status].length === 0;
}

/** An action is overdue when it is past due and still open or in progress. */
export function isCorrectiveActionOverdue(
  action: { dueDate: string; status: CorrectiveActionStatus },
  now: number = Date.now(),
): boolean {
  if (action.status === "COMPLETED" || action.status === "VERIFIED") {
    return false;
  }

  const due = new Date(action.dueDate).getTime();

  return Number.isFinite(due) && due < now;
}

export function correctiveActionDetailHref(actionId: string): string {
  return `/corrective-actions/${actionId}`;
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isCorrectiveActionStatus(
  value: unknown,
): value is CorrectiveActionStatus {
  return (
    typeof value === "string" &&
    (CORRECTIVE_ACTION_STATUSES as readonly string[]).includes(value)
  );
}

function isCorrectiveActionSource(
  value: unknown,
): value is CorrectiveActionSource {
  return (
    typeof value === "string" &&
    (CORRECTIVE_ACTION_SOURCES as readonly string[]).includes(value)
  );
}

/** Parses register filters, falling back safely for malformed URL values. */
export function parseCorrectiveActionFilters(
  searchParams: URLSearchParams,
): CorrectiveActionFilterState {
  const rawSiteId = searchParams.get("siteId") ?? "";
  const rawStatus = searchParams.get("status");
  const rawSource = searchParams.get("source");
  const rawOverdue = searchParams.get("overdue");

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(CORRECTIVE_ACTION_PAGE_SIZE),
    10,
  );

  return {
    siteId: OBJECT_ID_PATTERN.test(rawSiteId) ? rawSiteId : "",
    status: isCorrectiveActionStatus(rawStatus) ? rawStatus : "",
    source: isCorrectiveActionSource(rawSource) ? rawSource : "",
    overdue: rawOverdue === "true",
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) &&
      limit >= 1 &&
      limit <= MAX_CORRECTIVE_ACTION_PAGE_SIZE
        ? limit
        : CORRECTIVE_ACTION_PAGE_SIZE,
  };
}

/** Builds shareable URL state, omitting defaults. */
export function buildCorrectiveActionFilterSearchParams(
  filters: CorrectiveActionFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.siteId) {
    searchParams.set("siteId", filters.siteId);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.source) {
    searchParams.set("source", filters.source);
  }

  if (filters.overdue) {
    searchParams.set("overdue", "true");
  }

  if (filters.page > 1) {
    searchParams.set("page", String(filters.page));
  }

  if (filters.limit !== CORRECTIVE_ACTION_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActiveCorrectiveActionFilters(
  filters: CorrectiveActionFilterState,
): boolean {
  return Boolean(
    filters.siteId || filters.status || filters.source || filters.overdue,
  );
}
