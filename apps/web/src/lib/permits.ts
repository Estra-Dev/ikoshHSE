import {
  PERMIT_STATUSES,
  PERMIT_TO_WORK_TYPES,
  type PermitStatus,
  type PermitWorkType,
  type RiskAssessmentSummary,
} from "./api/types";
import { isCurrentRiskAssessment } from "./risk-assessments";

/**
 * Pure URL-state, lifecycle and expiry helpers for the permit register.
 *
 * Filter state lives in the query string so a filtered register is shareable.
 * The API remains authoritative for scoping, transitions, approval and every
 * validity-window check.
 */

export const PERMIT_PAGE_SIZE = 20;
export const MAX_PERMIT_PAGE_SIZE = 100;
export const MAX_PERMIT_SEARCH_LENGTH = 200;
export const MAX_LINKED_RISK_ASSESSMENTS = 10;
export const PERMIT_ATTENTION_WINDOW_DAYS = 7;

export type PermitAttentionFilter = "ACTIVE_EXPIRING_SOON" | "";
export type PermitAttentionKind =
  | "SUSPENDED"
  | "SUBMITTED"
  | "ACTIVE_EXPIRING_SOON";

export interface PermitFilterState {
  q: string;
  status: PermitStatus | "";
  workType: PermitWorkType | "";
  siteId: string;
  responsiblePersonId: string;
  page: number;
  limit: number;
  attention: PermitAttentionFilter;
}

export const EMPTY_PERMIT_FILTERS: PermitFilterState = {
  q: "",
  status: "",
  workType: "",
  siteId: "",
  responsiblePersonId: "",
  attention: "",
  page: 1,
  limit: PERMIT_PAGE_SIZE,
};

/** Lifecycle mirrored from the server. */
export const PERMIT_STATUS_TRANSITIONS: Record<
  PermitStatus,
  readonly PermitStatus[]
> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "CLOSED"],
  CLOSED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function nextPermitStatuses(
  status: PermitStatus,
): readonly PermitStatus[] {
  return PERMIT_STATUS_TRANSITIONS[status];
}

export function isPermitTerminal(status: PermitStatus): boolean {
  return PERMIT_STATUS_TRANSITIONS[status].length === 0;
}

/** Only drafts may have their content edited. */
export function isPermitEditable(status: PermitStatus): boolean {
  return status === "DRAFT";
}

/** Active work may be suspended or closed. */
export function isPermitInFlight(status: PermitStatus): boolean {
  return status === "ACTIVE" || status === "SUSPENDED";
}

export function permitDetailHref(permitId: string): string {
  return `/permits/${permitId}`;
}

/** Validity is inclusive at both ends, matching the server's activation rule. */
export function isWithinPermitValidity(
  permit: { validFrom: string; validTo: string },
  now: number = Date.now(),
): boolean {
  const from = new Date(permit.validFrom).getTime();
  const to = new Date(permit.validTo).getTime();

  return (
    Number.isFinite(from) && Number.isFinite(to) && now >= from && now <= to
  );
}

/**
 * An expired permit is one whose validity end has passed while still in a
 * non-terminal workflow state. Closed, rejected and cancelled permits are
 * history, not expired work.
 */
export function isPermitExpired(
  permit: { status: PermitStatus; validTo: string; isExpired?: boolean },
  now: number = Date.now(),
): boolean {
  if (typeof permit.isExpired === "boolean") {
    return permit.isExpired;
  }

  if (isPermitTerminal(permit.status)) {
    return false;
  }

  const to = new Date(permit.validTo).getTime();
  return Number.isFinite(to) && to < now;
}

/** The permit can only be activated or resumed inside its validity window. */
export function canUsePermitNow(
  permit: { status: PermitStatus; validFrom: string; validTo: string },
  now: number = Date.now(),
): boolean {
  return (
    (permit.status === "APPROVED" || permit.status === "SUSPENDED") &&
    isWithinPermitValidity(permit, now)
  );
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isPermitStatus(value: unknown): value is PermitStatus {
  return (
    typeof value === "string" &&
    (PERMIT_STATUSES as readonly string[]).includes(value)
  );
}

function isPermitWorkType(value: unknown): value is PermitWorkType {
  return (
    typeof value === "string" &&
    (PERMIT_TO_WORK_TYPES as readonly string[]).includes(value)
  );
}

function objectIdOrEmpty(value: string | null): string {
  return value !== null && OBJECT_ID_PATTERN.test(value) ? value : "";
}

/** Parses register filters, falling back safely for malformed URL values. */
export function parsePermitFilters(
  searchParams: URLSearchParams,
): PermitFilterState {
  const rawStatus = searchParams.get("status");
  const rawWorkType = searchParams.get("workType");
  const rawQuery = (searchParams.get("q") ?? "").trim();

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(PERMIT_PAGE_SIZE),
    10,
  );

  const rawAttention = searchParams.get("attention");

  const requestedAttention: PermitAttentionFilter =
    rawAttention === "ACTIVE_EXPIRING_SOON" ? "ACTIVE_EXPIRING_SOON" : "";

  const attention =
    requestedAttention && (!rawStatus || rawStatus === "ACTIVE")
      ? requestedAttention
      : "";

  return {
    q: rawQuery.slice(0, MAX_PERMIT_SEARCH_LENGTH),
    status: attention ? "ACTIVE" : isPermitStatus(rawStatus) ? rawStatus : "",
    attention,
    workType: isPermitWorkType(rawWorkType) ? rawWorkType : "",
    siteId: objectIdOrEmpty(searchParams.get("siteId")),
    responsiblePersonId: objectIdOrEmpty(
      searchParams.get("responsiblePersonId"),
    ),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) && limit >= 1 && limit <= MAX_PERMIT_PAGE_SIZE
        ? limit
        : PERMIT_PAGE_SIZE,
  };
}

/** Builds shareable URL state, omitting defaults. */
export function buildPermitFilterSearchParams(
  filters: PermitFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q) searchParams.set("q", filters.q);
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.workType) searchParams.set("workType", filters.workType);
  if (filters.siteId) searchParams.set("siteId", filters.siteId);
  if (filters.responsiblePersonId) {
    searchParams.set("responsiblePersonId", filters.responsiblePersonId);
  }
  if (filters.page > 1) searchParams.set("page", String(filters.page));
  if (filters.limit !== PERMIT_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  if (filters.attention) {
    searchParams.set("attention", filters.attention);
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActivePermitFilters(filters: PermitFilterState): boolean {
  return Boolean(
    filters.q ||
    filters.status ||
    filters.attention ||
    filters.workType ||
    filters.siteId ||
    filters.responsiblePersonId,
  );
}

/**
 * Builds register filters for a manager attention category.
 * Preserves site scope and page size while clearing unrelated filters.
 */
export function permitAttentionFilters(
  filters: PermitFilterState,
  kind: PermitAttentionKind,
): PermitFilterState {
  return {
    ...filters,
    q: "",
    workType: "",
    responsiblePersonId: "",
    status: kind === "ACTIVE_EXPIRING_SOON" ? "ACTIVE" : kind,
    attention: kind === "ACTIVE_EXPIRING_SOON" ? "ACTIVE_EXPIRING_SOON" : "",
    page: 1,
  };
}

/**
 * Splits the free-text worker editor into clean lines. Workers are names and
 * roles, not accounts, so the client only normalizes whitespace and removes
 * blank rows before sending the list.
 */
export function parseWorkersInvolved(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((worker) => worker.trim())
    .filter((worker) => worker.length > 0);
}

/** Labels shown next to the close-out checkboxes. */
export const PERMIT_CLOSURE_CHECK_LABELS = {
  workAreaSecured: "Work area secured",
  personnelAccountedFor: "All personnel accounted for",
  equipmentIsolated: "Equipment isolated and made safe",
  siteHandoverCompleted: "Site handover completed",
} as const;

/**
 * A permit may only newly link a current approved assessment that belongs to
 * the permit's exact project and site. Historical links are preserved by the
 * API and handled separately in the editor.
 */
export function isRiskAssessmentEligibleForPermit(
  assessment: Pick<
    RiskAssessmentSummary,
    "status" | "supersededBy" | "project" | "site"
  >,
  projectId: string,
  siteId: string,
): boolean {
  return (
    projectId.length > 0 &&
    siteId.length > 0 &&
    assessment.project.id === projectId &&
    assessment.site?.id === siteId &&
    isCurrentRiskAssessment(assessment)
  );
}

/** Adds or removes a link, refusing to exceed the server's 10-link limit. */
export function toggleLinkedRiskAssessment(
  ids: readonly string[],
  id: string,
): string[] {
  if (ids.includes(id)) {
    return ids.filter((value) => value !== id);
  }

  if (ids.length >= MAX_LINKED_RISK_ASSESSMENTS) {
    return [...ids];
  }

  return [...ids, id];
}
