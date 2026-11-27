import type {
  HseCategoryCount,
  HseDashboard,
  HseReport,
  HseTrendPoint,
  IncidentStatus,
  IncidentType,
  SiteSummary,
} from "./api/types";
import type { ReportFilterState } from "./reports";

/**
 * Pure dashboard helpers.
 *
 * The dashboard must stay within a bounded request budget and every displayed
 * number must come from the API aggregates. Keeping query construction and KPI
 * derivation here makes both rules directly testable.
 */

export const DASHBOARD_RANGES = ["7d", "30d", "90d", "all"] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_RANGE_LABELS: Record<DashboardRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

/** Maximum number of sites compared against the overall scope. */
export const MAX_COMPARISON_SITES = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardScopeFilters {
  range: DashboardRange;
  projectId: string;
  siteId: string;
}

export const EMPTY_DASHBOARD_FILTERS: DashboardScopeFilters = {
  range: "all",
  projectId: "",
  siteId: "",
};

/** Inclusive start of a dashboard range, or `null` for all time. */
export function dashboardRangeStart(
  range: DashboardRange,
  now: Date = new Date(),
): Date | null {
  switch (range) {
    case "7d":
      return new Date(now.getTime() - 7 * DAY_MS);
    case "30d":
      return new Date(now.getTime() - 30 * DAY_MS);
    case "90d":
      return new Date(now.getTime() - 90 * DAY_MS);
    case "all":
      return null;
  }
}

/** Builds `/api/hse/dashboard` query parameters for a dashboard scope. */
export function buildDashboardSearchParams(
  filters: DashboardScopeFilters,
  now: Date = new Date(),
): URLSearchParams {
  const searchParams = new URLSearchParams();
  const from = dashboardRangeStart(filters.range, now);

  if (from) {
    searchParams.set("from", from.toISOString());
    searchParams.set("to", now.toISOString());
  }

  if (filters.projectId) {
    searchParams.set("projectId", filters.projectId);
  }

  if (filters.siteId) {
    searchParams.set("siteId", filters.siteId);
  }

  return searchParams;
}

/**
 * Maps the dashboard scope onto the existing cross-module report endpoint.
 * The same range calculation drives both requests so every date-filtered
 * aggregate and chart covers the same window.
 */
export function buildReportFilters(
  filters: DashboardScopeFilters,
  now: Date = new Date(),
): ReportFilterState {
  const from = dashboardRangeStart(filters.range, now);

  return {
    projectId: filters.projectId,
    siteId: filters.siteId,
    from: from ? from.toISOString() : "",
    to: from ? now.toISOString() : "",
  };
}

/** Adds the selected site to a register link without dropping existing query state. */
export function appendSiteFilter(href: string, siteId: string): string {
  if (!siteId) {
    return href;
  }

  const [path, query = ""] = href.split("?");
  const searchParams = new URLSearchParams(query);
  searchParams.set("siteId", siteId);
  const encoded = searchParams.toString();

  return encoded ? `${path}?${encoded}` : path;
}

export interface IncidentListQuery {
  siteId?: string;
  status?: IncidentStatus | "";
  type?: IncidentType | "";
  /** Narrows the register to the caller's own reports. */
  mine?: boolean;
  page?: number;
  limit?: number;
}

/** Builds `/api/incidents` query parameters for bounded list queries. */
export function buildIncidentListSearchParams(
  query: IncidentListQuery,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.siteId) {
    searchParams.set("siteId", query.siteId);
  }

  if (query.status) {
    searchParams.set("status", query.status);
  }

  if (query.type) {
    searchParams.set("type", query.type);
  }

  if (query.mine) {
    searchParams.set("mine", "true");
  }

  if (query.page !== undefined) {
    searchParams.set("page", String(query.page));
  }

  if (query.limit !== undefined) {
    searchParams.set("limit", String(query.limit));
  }

  return searchParams;
}

/** Bounded project list used by the dashboard scope controls. */
export function buildProjectListSearchParams(limit = 100): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("limit", String(limit));
  return searchParams;
}

/** Bounded, site-scoped list used by filters and site-name lookups. */
export function buildSiteListSearchParams({
  projectId = "",
  limit = 100,
  includeInactive = false,
}: {
  projectId?: string;
  limit?: number;
  includeInactive?: boolean;
} = {}): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (projectId) {
    searchParams.set("projectId", projectId);
  }

  if (includeInactive) {
    searchParams.set("includeInactive", "true");
  }

  searchParams.set("limit", String(limit));
  return searchParams;
}

export interface DashboardKpis {
  /** Reports classified as incidents (near misses excluded). */
  incidents: number;
  nearMisses: number;
  /** Reports in REPORTED or TRIAGED status. */
  openCases: number;
  unclassified: number;
  closedCases: number;
  totalReports: number;
  /** Share of all reports that are near misses, from 0 to 1. */
  nearMissShare: number;
}

/** Derives the KPI row strictly from the dashboard aggregate response. */
export function deriveDashboardKpis(
  dashboard: HseDashboard | undefined,
): DashboardKpis | null {
  if (!dashboard) {
    return null;
  }

  const { incidents } = dashboard;
  const totalReports = incidents.total;
  const nearMisses = incidents.nearMisses;

  return {
    incidents: Math.max(0, totalReports - nearMisses),
    nearMisses,
    openCases:
      (incidents.byStatus.REPORTED ?? 0) + (incidents.byStatus.TRIAGED ?? 0),
    unclassified: incidents.unclassified,
    closedCases: incidents.byStatus.CLOSED ?? 0,
    totalReports,
    nearMissShare: totalReports > 0 ? nearMisses / totalReports : 0,
  };
}

export interface ReportKpis {
  openCapas: number;
  overdueCapas: number;
  activePermits: number;
  completedInspections: number;
  openRiskAssessments: number;
  trainingFollowUp: number;
}

function statusCount(
  counts: Record<string, number>,
  status: string,
): number {
  return Math.max(0, counts[status] ?? 0);
}

/**
 * Derives cross-module KPIs from the report aggregate. Current-state counts
 * (`overdueCapas`) are passed through from the server and are never treated as
 * date-ranged figures.
 */
export function deriveReportKpis(
  report: HseReport | undefined,
): ReportKpis | null {
  if (!report) {
    return null;
  }

  return {
    openCapas:
      statusCount(report.correctiveActions.byStatus, "OPEN") +
      statusCount(report.correctiveActions.byStatus, "IN_PROGRESS"),
    overdueCapas: Math.max(0, report.correctiveActions.overdue),
    activePermits: statusCount(report.permits.byStatus, "ACTIVE"),
    completedInspections: statusCount(
      report.inspections.byStatus,
      "COMPLETED",
    ),
    openRiskAssessments:
      statusCount(report.riskAssessments.byStatus, "DRAFT") +
      statusCount(report.riskAssessments.byStatus, "IN_REVIEW"),
    trainingFollowUp: Math.max(0, report.training.attendance.absent),
  };
}

export interface ChartDatum {
  key: string;
  label: string;
  count: number;
}

/** Builds an ordered chart series from an API status/level facet. */
export function chartSeries(
  counts: Record<string, number>,
  keys: readonly string[],
  labels?: Record<string, string>,
): ChartDatum[] {
  return keys.map((key) => ({
    key,
    label: labels?.[key] ?? formatHseLabel(key),
    count: Math.max(0, counts[key] ?? 0),
  }));
}

/** Omits empty segments from donut charts while preserving order. */
export function nonZeroSeries(series: readonly ChartDatum[]): ChartDatum[] {
  return series.filter((item) => item.count > 0);
}

export function seriesTotal(series: readonly ChartDatum[]): number {
  return series.reduce((total, item) => total + item.count, 0);
}

export interface TrendSummary {
  reports: number;
  reportingDays: number;
  peak: HseTrendPoint | null;
  firstDate: string | null;
  lastDate: string | null;
}

/** Summarises the daily reporting trend without inventing zero-report days. */
export function summariseTrend(trend: readonly HseTrendPoint[]): TrendSummary {
  if (trend.length === 0) {
    return {
      reports: 0,
      reportingDays: 0,
      peak: null,
      firstDate: null,
      lastDate: null,
    };
  }

  let reports = 0;
  let peak = trend[0];

  for (const point of trend) {
    reports += point.count;

    if (point.count > peak.count) {
      peak = point;
    }
  }

  return {
    reports,
    reportingDays: trend.length,
    peak,
    firstDate: trend[0].date,
    lastDate: trend[trend.length - 1].date,
  };
}

/**
 * Sites that may be compared in the dashboard. Comparisons are bounded to
 * four sites, are listed alphabetically (the API order), and are suspended
 * while a single site filter is active because the scope itself is then one
 * site.
 */
export function selectComparisonSites(
  sites: readonly SiteSummary[],
  filters: Pick<DashboardScopeFilters, "siteId">,
): SiteSummary[] {
  if (filters.siteId) {
    return [];
  }

  return sites.slice(0, MAX_COMPARISON_SITES);
}

/**
 * The incident endpoint supports site scoping but not project scoping. A
 * project-only dashboard scope therefore cannot produce a filtered "latest
 * reports" feed; the UI must explain that instead of showing unfiltered data.
 */
export function canScopeRecentReports(
  filters: Pick<DashboardScopeFilters, "projectId" | "siteId">,
): boolean {
  return !filters.projectId || Boolean(filters.siteId);
}

/** Returns the largest categories plus the combined remainder. */
export function topCategoryCounts(
  categories: readonly HseCategoryCount[],
  limit = 6,
): { categories: HseCategoryCount[]; otherCount: number } {
  const visible = categories.slice(0, limit);

  return {
    categories: visible,
    otherCount: categories
      .slice(limit)
      .reduce((total, category) => total + category.count, 0),
  };
}

/** Formats enum codes such as `LOST_TIME_INJURY` for display. */
export function formatHseLabel(value: string): string {
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
