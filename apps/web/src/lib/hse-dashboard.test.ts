import { describe, expect, it } from "vitest";
import {
  buildDashboardSearchParams,
  buildIncidentListSearchParams,
  buildProjectListSearchParams,
  buildSiteListSearchParams,
  canScopeRecentReports,
  deriveDashboardKpis,
  MAX_COMPARISON_SITES,
  selectComparisonSites,
  summariseTrend,
  topCategoryCounts,
  type DashboardScopeFilters,
} from "./hse-dashboard";
import type {
  HseDashboard,
  HseTrendPoint,
  SiteSummary,
} from "./api/types";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function dashboardFixture(overrides: Partial<HseDashboard> = {}): HseDashboard {
  return {
    scope: {
      projectId: null,
      siteId: null,
      from: null,
      to: null,
    },
    totals: {
      projects: 3,
      sites: 5,
      contractors: 2,
      contractorPersonnel: 12,
      attachments: 8,
      incidents: 12,
      nearMisses: 3,
    },
    incidents: {
      total: 12,
      nearMisses: 3,
      byStatus: { REPORTED: 2, TRIAGED: 4, CLOSED: 6 },
      byCategory: [
        { category: "LOST_TIME_INJURY", count: 3 },
        { category: "FIRST_AID_CASE", count: 2 },
      ],
      unclassified: 1,
      trend: [
        { date: "2026-06-01", count: 2 },
        { date: "2026-06-02", count: 1 },
      ],
    },
    lastUpdated: "2026-06-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("dashboard query construction", () => {
  it("adds bounded date scope and optional project/site filters", () => {
    const filters: DashboardScopeFilters = {
      range: "30d",
      projectId: "507f1f77bcf86cd799439011",
      siteId: "507f1f77bcf86cd799439012",
    };
    const searchParams = buildDashboardSearchParams(filters, NOW);

    expect(searchParams.get("from")).toBe("2026-05-16T12:00:00.000Z");
    expect(searchParams.get("to")).toBe("2026-06-15T12:00:00.000Z");
    expect(searchParams.get("projectId")).toBe(filters.projectId);
    expect(searchParams.get("siteId")).toBe(filters.siteId);
  });

  it("omits date bounds for all-time scope and empty filters", () => {
    const searchParams = buildDashboardSearchParams(
      { range: "all", projectId: "", siteId: "" },
      NOW,
    );

    expect(searchParams.has("from")).toBe(false);
    expect(searchParams.has("to")).toBe(false);
    expect(searchParams.has("projectId")).toBe(false);
    expect(searchParams.has("siteId")).toBe(false);
  });

  it("builds bounded incident list queries", () => {
    const searchParams = buildIncidentListSearchParams({
      siteId: "507f1f77bcf86cd799439012",
      status: "TRIAGED",
      type: "NEAR_MISS",
      limit: 5,
    });

    expect(searchParams.get("siteId")).toBe("507f1f77bcf86cd799439012");
    expect(searchParams.get("status")).toBe("TRIAGED");
    expect(searchParams.get("type")).toBe("NEAR_MISS");
    expect(searchParams.get("limit")).toBe("5");
    expect(searchParams.has("page")).toBe(false);
  });

  it("keeps project and site list queries bounded to 100 records", () => {
    expect(buildProjectListSearchParams().get("limit")).toBe("100");
    expect(buildSiteListSearchParams().get("limit")).toBe("100");

    const siteParams = buildSiteListSearchParams({
      projectId: "507f1f77bcf86cd799439011",
    });
    expect(siteParams.get("projectId")).toBe("507f1f77bcf86cd799439011");
  });
});

function siteFixture(id: string, name: string): SiteSummary {
  return {
    id,
    project: { id: "507f1f77bcf86cd799439010" },
    name,
    code: name.toUpperCase(),
    location: null,
    description: "",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("dashboard comparison and feed scoping", () => {
  const sites = Array.from({ length: 6 }, (_, index) =>
    siteFixture(`507f1f77bcf86cd79943901${index + 1}`, `Site ${index + 1}`),
  );

  it("compares at most four alphabetically listed sites", () => {
    const selected = selectComparisonSites(sites, { siteId: "" });

    expect(selected).toHaveLength(MAX_COMPARISON_SITES);
    expect(selected.map((site) => site.name)).toEqual([
      "Site 1",
      "Site 2",
      "Site 3",
      "Site 4",
    ]);
  });

  it("suspends comparison while a single site is selected", () => {
    expect(selectComparisonSites(sites, { siteId: sites[0].id })).toEqual([]);
  });

  it("only scopes recent reports when the endpoint can honour the scope", () => {
    expect(canScopeRecentReports({ projectId: "", siteId: "" })).toBe(true);
    expect(
      canScopeRecentReports({ projectId: "", siteId: sites[0].id }),
    ).toBe(true);
    expect(
      canScopeRecentReports({ projectId: "project", siteId: sites[0].id }),
    ).toBe(true);
    expect(canScopeRecentReports({ projectId: "project", siteId: "" })).toBe(
      false,
    );
  });
});

describe("dashboard KPI derivation", () => {
  it("derives incidents, near misses, open cases and shares from aggregates", () => {
    const kpis = deriveDashboardKpis(dashboardFixture());

    expect(kpis).toEqual({
      incidents: 9,
      nearMisses: 3,
      openCases: 6,
      unclassified: 1,
      closedCases: 6,
      totalReports: 12,
      nearMissShare: 0.25,
    });
  });

  it("returns zero counts for an empty aggregate", () => {
    const kpis = deriveDashboardKpis(
      dashboardFixture({
        incidents: {
          total: 0,
          nearMisses: 0,
          byStatus: { REPORTED: 0, TRIAGED: 0, CLOSED: 0 },
          byCategory: [],
          unclassified: 0,
          trend: [],
        },
      }),
    );

    expect(kpis).toMatchObject({
      incidents: 0,
      nearMisses: 0,
      openCases: 0,
      totalReports: 0,
      nearMissShare: 0,
    });
  });
});

describe("dashboard presentation helpers", () => {
  it("summarises the reporting trend without zero-filling", () => {
    const trend: HseTrendPoint[] = [
      { date: "2026-06-01", count: 2 },
      { date: "2026-06-02", count: 4 },
      { date: "2026-06-03", count: 1 },
    ];

    expect(summariseTrend(trend)).toEqual({
      reports: 7,
      reportingDays: 3,
      peak: { date: "2026-06-02", count: 4 },
      firstDate: "2026-06-01",
      lastDate: "2026-06-03",
    });
  });

  it("combines categories beyond the visible limit", () => {
    const result = topCategoryCounts(
      [
        { category: "A", count: 5 },
        { category: "B", count: 4 },
        { category: "C", count: 3 },
        { category: "D", count: 2 },
      ],
      2,
    );

    expect(result.categories).toHaveLength(2);
    expect(result.otherCount).toBe(5);
  });
});
