import { describe, expect, it } from "vitest";
import {
  buildRiskAssessmentFilterSearchParams,
  EMPTY_RISK_ASSESSMENT_FILTERS,
  hasActiveRiskAssessmentFilters,
  highestRiskLevel,
  isRiskAssessmentTerminal,
  nextRiskAssessmentStatuses,
  parseRiskAssessmentFilters,
  RISK_ASSESSMENT_PAGE_SIZE,
  riskAssessmentDetailHref,
  riskAssessmentLevelSummary,
  riskLevelFor,
  riskScore,
  type RiskAssessmentFilterState,
} from "./risk-assessments";

const SITE_ID = "507f1f77bcf86cd799439011";
const OWNER_ID = "507f1f77bcf86cd799439012";

describe("parseRiskAssessmentFilters", () => {
  it("returns the default state for an empty query string", () => {
    expect(parseRiskAssessmentFilters(new URLSearchParams())).toEqual(
      EMPTY_RISK_ASSESSMENT_FILTERS,
    );
  });

  it("falls back safely for malformed values", () => {
    const parsed = parseRiskAssessmentFilters(
      new URLSearchParams({
        status: "OPEN",
        siteId: "not-an-object-id",
        ownerId: "also-bad",
        page: "0",
        limit: "500",
      }),
    );

    expect(parsed).toEqual(EMPTY_RISK_ASSESSMENT_FILTERS);
  });

  it("round-trips a fully populated filter state", () => {
    const filters: RiskAssessmentFilterState = {
      q: "scaffold",
      status: "IN_REVIEW",
      siteId: SITE_ID,
      ownerId: OWNER_ID,
      page: 3,
      limit: 50,
    };

    const params = buildRiskAssessmentFilterSearchParams(filters);

    expect(parseRiskAssessmentFilters(params)).toEqual(filters);
  });

  it("omits defaults from the URL", () => {
    expect(
      buildRiskAssessmentFilterSearchParams(
        EMPTY_RISK_ASSESSMENT_FILTERS,
      ).toString(),
    ).toBe("");
  });

  it("detects active filters but ignores paging", () => {
    expect(
      hasActiveRiskAssessmentFilters({
        ...EMPTY_RISK_ASSESSMENT_FILTERS,
        page: 4,
      }),
    ).toBe(false);
    expect(
      hasActiveRiskAssessmentFilters({
        ...EMPTY_RISK_ASSESSMENT_FILTERS,
        status: "DRAFT",
      }),
    ).toBe(true);
    expect(
      hasActiveRiskAssessmentFilters({
        ...EMPTY_RISK_ASSESSMENT_FILTERS,
        ownerId: OWNER_ID,
      }),
    ).toBe(true);
  });

  it("caps the page size", () => {
    const parsed = parseRiskAssessmentFilters(
      new URLSearchParams({ limit: "1000" }),
    );

    expect(parsed.limit).toBe(RISK_ASSESSMENT_PAGE_SIZE);
  });
});

describe("risk assessment workflow", () => {
  it("mirrors the server transitions", () => {
    expect(nextRiskAssessmentStatuses("DRAFT")).toEqual([
      "IN_REVIEW",
      "ARCHIVED",
    ]);
    expect(nextRiskAssessmentStatuses("IN_REVIEW")).toEqual([
      "APPROVED",
      "DRAFT",
      "ARCHIVED",
    ]);
    expect(nextRiskAssessmentStatuses("APPROVED")).toEqual(["ARCHIVED"]);
    expect(nextRiskAssessmentStatuses("ARCHIVED")).toEqual([]);
  });

  it("treats ARCHIVED as terminal", () => {
    expect(isRiskAssessmentTerminal("ARCHIVED")).toBe(true);
    expect(isRiskAssessmentTerminal("APPROVED")).toBe(false);
  });

  it("builds the canonical detail route", () => {
    expect(riskAssessmentDetailHref("abc")).toBe("/risk-assessments/abc");
  });
});

describe("risk matrix", () => {
  it("maps scores onto the same bands as the server", () => {
    expect(riskLevelFor(1, 1)).toBe("LOW"); // 1
    expect(riskLevelFor(2, 2)).toBe("LOW"); // 4
    expect(riskLevelFor(1, 5)).toBe("MEDIUM"); // 5
    expect(riskLevelFor(3, 3)).toBe("MEDIUM"); // 9
    expect(riskLevelFor(2, 5)).toBe("HIGH"); // 10
    expect(riskLevelFor(3, 4)).toBe("HIGH"); // 12
    expect(riskLevelFor(3, 5)).toBe("CRITICAL"); // 15
    expect(riskLevelFor(5, 5)).toBe("CRITICAL"); // 25
  });

  it("computes and ranks scores", () => {
    expect(riskScore(3, 4)).toBe(12);
    expect(highestRiskLevel([])).toBeNull();
    expect(highestRiskLevel(["LOW", "CRITICAL", "MEDIUM"])).toBe("CRITICAL");
  });

  it("summarizes the highest inherent and residual bands", () => {
    expect(
      riskAssessmentLevelSummary([
        { inherentLevel: "HIGH", residualLevel: "MEDIUM" },
        { inherentLevel: "CRITICAL", residualLevel: "HIGH" },
      ]),
    ).toEqual({ inherent: "CRITICAL", residual: "HIGH" });

    expect(riskAssessmentLevelSummary([])).toEqual({
      inherent: null,
      residual: null,
    });
  });
});
