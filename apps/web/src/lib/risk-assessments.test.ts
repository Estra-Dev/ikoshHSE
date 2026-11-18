import { describe, expect, it } from "vitest";
import {
  buildRiskAssessmentFilterSearchParams,
  createRiskTaskStepId,
  EMPTY_RISK_ASSESSMENT_FILTERS,
  groupHazardsByTaskStep,
  hasActiveRiskAssessmentFilters,
  highestRiskLevel,
  isCurrentRiskAssessment,
  isRiskAssessmentReviewDue,
  isRiskAssessmentTerminal,
  isSupersededRiskAssessment,
  nextRiskAssessmentStatuses,
  parseRiskAssessmentFilters,
  RISK_ASSESSMENT_PAGE_SIZE,
  riskAssessmentDetailHref,
  riskAssessmentLevelSummary,
  riskAssessmentRevisionLabel,
  riskLevelFor,
  riskScore,
  type RiskAssessmentFilterState,
} from "./risk-assessments";
import type {
  RiskAssessmentHazard,
  RiskAssessmentTaskStep,
} from "./api/types";

const SITE_ID = "507f1f77bcf86cd799439011";
const OWNER_ID = "507f1f77bcf86cd799439012";

function hazard(
  id: string,
  taskStepId: string | null,
): RiskAssessmentHazard {
  return {
    id,
    hazard: `Hazard ${id}`,
    consequences: "",
    existingControls: "",
    likelihood: 3,
    severity: 3,
    inherentLevel: "MEDIUM",
    residualLikelihood: 2,
    residualSeverity: 2,
    residualLevel: "LOW",
    additionalControls: "",
    taskStepId,
  };
}

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

describe("controlled revisions and JHA task steps", () => {
  it("derives current, superseded and review-due state like the server", () => {
    expect(
      isCurrentRiskAssessment({
        status: "APPROVED",
        supersededBy: null,
      }),
    ).toBe(true);
    expect(
      isCurrentRiskAssessment({
        status: "APPROVED",
        supersededBy: "revision-2",
      }),
    ).toBe(false);
    expect(
      isCurrentRiskAssessment({ status: "DRAFT", supersededBy: null }),
    ).toBe(false);
    expect(
      isSupersededRiskAssessment({ supersededBy: "revision-2" }),
    ).toBe(true);
    expect(isSupersededRiskAssessment({ supersededBy: null })).toBe(false);

    expect(
      isRiskAssessmentReviewDue(
        "2026-01-01T00:00:00.000Z",
        new Date("2026-06-01T00:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isRiskAssessmentReviewDue(
        "2026-12-01T00:00:00.000Z",
        new Date("2026-06-01T00:00:00.000Z"),
      ),
    ).toBe(false);
    expect(isRiskAssessmentReviewDue(null)).toBe(false);
    expect(isRiskAssessmentReviewDue("not-a-date")).toBe(false);
    expect(riskAssessmentRevisionLabel(3)).toBe("Revision 3");
  });

  it("creates 24-hex task step ids", () => {
    const first = createRiskTaskStepId();
    const second = createRiskTaskStepId();

    expect(first).toMatch(/^[0-9a-f]{24}$/);
    expect(second).toMatch(/^[0-9a-f]{24}$/);
    expect(first).not.toBe(second);
  });

  it("groups hazards by task step and keeps unassigned hazards general", () => {
    const steps: RiskAssessmentTaskStep[] = [
      { id: "step-inspect", sequence: 1, description: "Inspect scaffold" },
      { id: "step-erect", sequence: 0, description: "Erect scaffold" },
    ];
    const groups = groupHazardsByTaskStep(
      [
        hazard("hazard-inspect", "step-inspect"),
        hazard("hazard-erect", "step-erect"),
        hazard("hazard-general", null),
        hazard("hazard-unknown", "missing-step"),
      ],
      steps,
    );

    expect(
      groups.map((group) => ({
        title: group.title,
        description: group.description,
        hazards: group.hazards.map((item) => item.id),
      })),
    ).toEqual([
      {
        title: "Task step 1",
        description: "Erect scaffold",
        hazards: ["hazard-erect"],
      },
      {
        title: "Task step 2",
        description: "Inspect scaffold",
        hazards: ["hazard-inspect"],
      },
      {
        title: "General hazards",
        description: null,
        hazards: ["hazard-general", "hazard-unknown"],
      },
    ]);
  });

  it("omits the general group when every hazard has a task step", () => {
    const groups = groupHazardsByTaskStep(
      [hazard("hazard-erect", "step-erect")],
      [{ id: "step-erect", sequence: 0, description: "Erect scaffold" }],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].hazards).toHaveLength(1);
  });
});
