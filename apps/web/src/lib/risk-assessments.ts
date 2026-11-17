import {
  RISK_ASSESSMENT_STATUSES,
  type RiskAssessmentHazard,
  type RiskAssessmentStatus,
  type RiskLevel,
} from "./api/types";

/**
 * Pure URL-state, workflow and risk-matrix helpers for risk assessments.
 *
 * The API remains authoritative for scoping and transitions; these helpers
 * only decide what the UI offers and how derived bands are previewed.
 */

export const RISK_ASSESSMENT_PAGE_SIZE = 20;
export const MAX_RISK_ASSESSMENT_PAGE_SIZE = 100;
export const MAX_RISK_SEARCH_LENGTH = 200;
export const MAX_RISK_HAZARDS = 100;

export interface RiskAssessmentFilterState {
  q: string;
  status: RiskAssessmentStatus | "";
  siteId: string;
  ownerId: string;
  page: number;
  limit: number;
}

export const EMPTY_RISK_ASSESSMENT_FILTERS: RiskAssessmentFilterState = {
  q: "",
  status: "",
  siteId: "",
  ownerId: "",
  page: 1,
  limit: RISK_ASSESSMENT_PAGE_SIZE,
};

/** Lifecycle mirrored from the server. ARCHIVED is terminal. */
export const RISK_ASSESSMENT_STATUS_TRANSITIONS: Record<
  RiskAssessmentStatus,
  readonly RiskAssessmentStatus[]
> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["APPROVED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function nextRiskAssessmentStatuses(
  status: RiskAssessmentStatus,
): readonly RiskAssessmentStatus[] {
  return RISK_ASSESSMENT_STATUS_TRANSITIONS[status];
}

export function isRiskAssessmentTerminal(
  status: RiskAssessmentStatus,
): boolean {
  return RISK_ASSESSMENT_STATUS_TRANSITIONS[status].length === 0;
}

export function riskAssessmentDetailHref(assessmentId: string): string {
  return `/risk-assessments/${assessmentId}`;
}

/** 5×5 matrix mirrored from `riskLevelFor` on the server. */
export function riskLevelFor(
  likelihood: number,
  severity: number,
): RiskLevel {
  const score = likelihood * severity;

  if (score <= 4) return "LOW";
  if (score <= 9) return "MEDIUM";
  if (score <= 14) return "HIGH";
  return "CRITICAL";
}

export function riskScore(likelihood: number, severity: number): number {
  return likelihood * severity;
}

export const RISK_LEVEL_RANK: Record<RiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function compareRiskLevel(left: RiskLevel, right: RiskLevel): number {
  return RISK_LEVEL_RANK[right] - RISK_LEVEL_RANK[left];
}

/** Most serious band across a set of levels, or null when empty. */
export function highestRiskLevel(
  levels: readonly RiskLevel[],
): RiskLevel | null {
  return levels.reduce<RiskLevel | null>(
    (highest, level) =>
      highest === null || RISK_LEVEL_RANK[level] > RISK_LEVEL_RANK[highest]
        ? level
        : highest,
    null,
  );
}

/** Highest inherent and residual bands for register summaries. */
export function riskAssessmentLevelSummary(
  hazards: readonly Pick<
    RiskAssessmentHazard,
    "inherentLevel" | "residualLevel"
  >[],
): { inherent: RiskLevel | null; residual: RiskLevel | null } {
  return {
    inherent: highestRiskLevel(hazards.map((hazard) => hazard.inherentLevel)),
    residual: highestRiskLevel(hazards.map((hazard) => hazard.residualLevel)),
  };
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isRiskAssessmentStatus(
  value: unknown,
): value is RiskAssessmentStatus {
  return (
    typeof value === "string" &&
    (RISK_ASSESSMENT_STATUSES as readonly string[]).includes(value)
  );
}

function objectIdOrEmpty(value: string | null): string {
  return value !== null && OBJECT_ID_PATTERN.test(value) ? value : "";
}

/** Parses register filters, falling back safely for malformed URL values. */
export function parseRiskAssessmentFilters(
  searchParams: URLSearchParams,
): RiskAssessmentFilterState {
  const rawStatus = searchParams.get("status");
  const rawQuery = (searchParams.get("q") ?? "").trim();

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(RISK_ASSESSMENT_PAGE_SIZE),
    10,
  );

  return {
    q: rawQuery.slice(0, MAX_RISK_SEARCH_LENGTH),
    status: isRiskAssessmentStatus(rawStatus) ? rawStatus : "",
    siteId: objectIdOrEmpty(searchParams.get("siteId")),
    ownerId: objectIdOrEmpty(searchParams.get("ownerId")),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) &&
      limit >= 1 &&
      limit <= MAX_RISK_ASSESSMENT_PAGE_SIZE
        ? limit
        : RISK_ASSESSMENT_PAGE_SIZE,
  };
}

/** Builds shareable URL state, omitting defaults. */
export function buildRiskAssessmentFilterSearchParams(
  filters: RiskAssessmentFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q) searchParams.set("q", filters.q);
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.siteId) searchParams.set("siteId", filters.siteId);
  if (filters.ownerId) searchParams.set("ownerId", filters.ownerId);
  if (filters.page > 1) searchParams.set("page", String(filters.page));
  if (filters.limit !== RISK_ASSESSMENT_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActiveRiskAssessmentFilters(
  filters: RiskAssessmentFilterState,
): boolean {
  return Boolean(filters.q || filters.status || filters.siteId || filters.ownerId);
}
