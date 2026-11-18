import { describe, expect, it } from "vitest";
import type { HseReport } from "./api/types";
import {
  buildReportCsv,
  buildReportFilterSearchParams,
  csvCell,
  hasActiveReportFilters,
  parseReportFilters,
} from "./reports";

function sampleReport(overrides: Partial<HseReport> = {}): HseReport {
  return {
    scope: { projectId: null, siteId: null, from: null, to: null },
    generatedAt: "2026-01-31T12:00:00.000Z",
    incidents: {
      total: 3,
      incidents: 2,
      nearMisses: 1,
      byStatus: { REPORTED: 2, TRIAGED: 1, CLOSED: 0 },
      byCategory: [{ category: "FIRST_AID_CASE", count: 1 }],
      unclassified: 2,
    },
    inspections: {
      total: 1,
      byStatus: { COMPLETED: 1 },
      findingsTotal: 2,
      findingsBySeverity: { HIGH: 1, LOW: 1 },
    },
    audits: {
      total: 1,
      byStatus: { COMPLETED: 1 },
      byType: { INTERNAL: 1 },
      findingsTotal: 1,
      findingsBySeverity: { MEDIUM: 1 },
      checklistByResult: { COMPLIANT: 2 },
    },
    permits: {
      total: 2,
      byStatus: { ACTIVE: 2 },
      byWorkType: [{ workType: "HOT_WORK", count: 1 }],
      expiringSoon: 1,
    },
    correctiveActions: {
      total: 4,
      byStatus: { OPEN: 3, VERIFIED: 1 },
      overdue: 2,
    },
    riskAssessments: {
      total: 1,
      byStatus: { APPROVED: 1 },
      hazardsTotal: 3,
      hazardsByResidualLevel: { MEDIUM: 3 },
      reviewsDue: 0,
    },
    training: {
      sessions: 1,
      byStatus: { COMPLETED: 1 },
      attendance: {
        invited: 2,
        attended: 1,
        absent: 1,
        completed: 1,
        certificatesIssued: 1,
        employees: 1,
        contractors: 1,
      },
    },
    toolboxTalks: {
      talks: 1,
      byStatus: { SCHEDULED: 1 },
      attendance: {
        invited: 2,
        attended: 0,
        absent: 0,
        acknowledged: 0,
        employees: 1,
        contractors: 1,
      },
    },
    ...overrides,
  };
}

describe("report filters", () => {
  it("round-trips filter state through the URL", () => {
    const params = buildReportFilterSearchParams({
      projectId: "p1",
      siteId: "s1",
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(parseReportFilters(params)).toEqual({
      projectId: "p1",
      siteId: "s1",
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  it("omits blank values and ignores unknown parameters", () => {
    const params = buildReportFilterSearchParams({
      projectId: "",
      siteId: " ",
      from: "",
      to: "",
    });

    expect(params.toString()).toBe("");
    expect(parseReportFilters(new URLSearchParams("unknown=1"))).toEqual({
      projectId: "",
      siteId: "",
      from: "",
      to: "",
    });
  });

  it("detects active filters", () => {
    expect(
      hasActiveReportFilters(parseReportFilters(new URLSearchParams())),
    ).toBe(false);
    expect(
      hasActiveReportFilters(
        parseReportFilters(new URLSearchParams("from=2026-01-01")),
      ),
    ).toBe(true);
  });
});

describe("report CSV export", () => {
  it("neutralises spreadsheet formula injection", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe(`"'=SUM(A1:A2)"`);
    expect(csvCell("+1234")).toBe(`"'+1234"`);
    expect(csvCell("-1234")).toBe(`"'-1234"`);
    expect(csvCell("@import")).toBe(`"'@import"`);
    expect(csvCell("plain")).toBe(`"plain"`);
  });

  it("escapes quotes and keeps numbers unquoted", () => {
    expect(csvCell('a "quoted" value')).toBe(`"a ""quoted"" value"`);
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
  });

  it("serialises every register section", () => {
    const csv = buildReportCsv(sampleReport());

    // Check for section headers
    // Check for section names in the first CSV column.
    for (const section of [
      "Incidents and near misses",
      "Inspections",
      "Audits",
      "Permits to work",
      "Corrective actions",
      "Risk assessments",
      "Training",
      "Toolbox talks",
    ]) {
      expect(csv).toContain(`"${section}",`);
    }

    // Check for three-column format (Section, Metric, Value)
    expect(csv).toContain(`"Incidents and near misses","Total",3`);
    expect(csv).toContain(`"Corrective actions","Overdue",2`);
    expect(csv).toContain(`"Training","Certificates issued",1`);
    expect(csv).toContain(`"Risk assessments","Residual risk: MEDIUM",3`);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("does not export zero-count distribution buckets", () => {
    const csv = buildReportCsv(sampleReport());
    expect(csv).not.toContain("Status: CLOSED");
  });
});
