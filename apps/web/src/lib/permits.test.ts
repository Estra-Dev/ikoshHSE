import { describe, expect, it } from "vitest";
import type { RiskAssessmentSummary } from "./api/types";
import {
  buildPermitFilterSearchParams,
  canUsePermitNow,
  EMPTY_PERMIT_FILTERS,
  hasActivePermitFilters,
  isPermitEditable,
  isPermitExpired,
  isPermitInFlight,
  isPermitTerminal,
  isRiskAssessmentEligibleForPermit,
  isWithinPermitValidity,
  MAX_LINKED_RISK_ASSESSMENTS,
  nextPermitStatuses,
  parsePermitFilters,
  parseWorkersInvolved,
  permitAttentionFilters,
  permitDetailHref,
  PERMIT_ATTENTION_WINDOW_DAYS,
  PERMIT_CLOSURE_CHECK_LABELS,
  PERMIT_PAGE_SIZE,
  toggleLinkedRiskAssessment,
} from "./permits";

describe("permit filters", () => {
  it("falls back safely for malformed URL values", () => {
    const filters = parsePermitFilters(
      new URLSearchParams({
        q: "   ",
        status: "UNKNOWN",
        workType: "SOMETHING",
        siteId: "not-an-id",
        responsiblePersonId: "nope",
        page: "-3",
        limit: "9999",
      }),
    );

    expect(filters).toEqual(EMPTY_PERMIT_FILTERS);
  });

  it("parses valid filters and omits defaults from the URL", () => {
    const filters = parsePermitFilters(
      new URLSearchParams({
        q: "tank",
        status: "ACTIVE",
        attention: "",
        workType: "HOT_WORK",
        siteId: "507f1f77bcf86cd799439011",
        responsiblePersonId: "507f1f77bcf86cd799439012",
        page: "3",
        limit: "50",
      }),
    );

    expect(filters).toEqual({
      q: "tank",
      status: "ACTIVE",
      attention: "",
      workType: "HOT_WORK",
      siteId: "507f1f77bcf86cd799439011",
      responsiblePersonId: "507f1f77bcf86cd799439012",
      page: 3,
      limit: 50,
    });

    expect(buildPermitFilterSearchParams(EMPTY_PERMIT_FILTERS).toString()).toBe(
      "",
    );
  });

  it("truncates oversized search text", () => {
    const filters = parsePermitFilters(
      new URLSearchParams({ q: "a".repeat(500) }),
    );

    expect(filters.q).toHaveLength(200);
  });

  it("detects whether any filter is active apart from paging", () => {
    expect(hasActivePermitFilters(EMPTY_PERMIT_FILTERS)).toBe(false);
    expect(hasActivePermitFilters({ ...EMPTY_PERMIT_FILTERS, page: 4 })).toBe(
      false,
    );

    expect(
      hasActivePermitFilters({ ...EMPTY_PERMIT_FILTERS, status: "ACTIVE" }),
    ).toBe(true);
    expect(
      hasActivePermitFilters({ ...EMPTY_PERMIT_FILTERS, workType: "HOT_WORK" }),
    ).toBe(true);
    expect(hasActivePermitFilters({ ...EMPTY_PERMIT_FILTERS, q: "tank" })).toBe(
      true,
    );
    expect(
      hasActivePermitFilters({
        ...EMPTY_PERMIT_FILTERS,
        siteId: "507f1f77bcf86cd799439011",
      }),
    ).toBe(true);
    expect(
      hasActivePermitFilters({
        ...EMPTY_PERMIT_FILTERS,
        responsiblePersonId: "507f1f77bcf86cd799439011",
      }),
    ).toBe(true);
  });

  it("round-trips non-default paging and filters", () => {
    const params = buildPermitFilterSearchParams({
      q: "tank",
      status: "SUSPENDED",
      attention: "",
      workType: "CONFINED_SPACE_ENTRY",
      siteId: "507f1f77bcf86cd799439011",
      responsiblePersonId: "507f1f77bcf86cd799439012",
      page: 2,
      limit: 50,
    });

    expect(params.get("q")).toBe("tank");
    expect(params.get("status")).toBe("SUSPENDED");
    expect(params.get("workType")).toBe("CONFINED_SPACE_ENTRY");
    expect(params.get("siteId")).toBe("507f1f77bcf86cd799439011");
    expect(params.get("responsiblePersonId")).toBe("507f1f77bcf86cd799439012");
    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("50");
  });
});

describe("permit lifecycle", () => {
  it("mirrors the forward lifecycle and terminal states", () => {
    expect(nextPermitStatuses("DRAFT")).toEqual(["SUBMITTED", "CANCELLED"]);
    expect(nextPermitStatuses("SUBMITTED")).toEqual([
      "APPROVED",
      "REJECTED",
      "CANCELLED",
    ]);
    expect(nextPermitStatuses("APPROVED")).toEqual(["ACTIVE", "CANCELLED"]);
    expect(nextPermitStatuses("ACTIVE")).toEqual(["SUSPENDED", "CLOSED"]);
    expect(nextPermitStatuses("SUSPENDED")).toEqual(["ACTIVE", "CLOSED"]);
    expect(nextPermitStatuses("CLOSED")).toEqual([]);
    expect(nextPermitStatuses("REJECTED")).toEqual([]);
    expect(nextPermitStatuses("CANCELLED")).toEqual([]);

    expect(isPermitTerminal("CLOSED")).toBe(true);
    expect(isPermitTerminal("REJECTED")).toBe(true);
    expect(isPermitTerminal("CANCELLED")).toBe(true);
    expect(isPermitTerminal("ACTIVE")).toBe(false);
  });

  it("only drafts are editable", () => {
    expect(isPermitEditable("DRAFT")).toBe(true);

    for (const status of [
      "SUBMITTED",
      "APPROVED",
      "ACTIVE",
      "SUSPENDED",
      "CLOSED",
      "REJECTED",
      "CANCELLED",
    ] as const) {
      expect(isPermitEditable(status)).toBe(false);
    }
  });

  it("treats active and suspended permits as in-flight work", () => {
    expect(isPermitInFlight("ACTIVE")).toBe(true);
    expect(isPermitInFlight("SUSPENDED")).toBe(true);
    expect(isPermitInFlight("APPROVED")).toBe(false);
    expect(isPermitInFlight("CLOSED")).toBe(false);
  });

  it("builds the detail href", () => {
    expect(permitDetailHref("507f1f77bcf86cd799439011")).toBe(
      "/permits/507f1f77bcf86cd799439011",
    );
  });
});

describe("permit validity", () => {
  const now = Date.parse("2026-06-01T12:00:00.000Z");

  const window = {
    validFrom: "2026-06-01T08:00:00.000Z",
    validTo: "2026-06-01T18:00:00.000Z",
  };

  it("treats validity as an inclusive window", () => {
    expect(isWithinPermitValidity(window, now)).toBe(true);
    expect(isWithinPermitValidity(window, Date.parse(window.validFrom))).toBe(
      true,
    );
    expect(isWithinPermitValidity(window, Date.parse(window.validTo))).toBe(
      true,
    );
    expect(isWithinPermitValidity(window, Date.parse(window.validTo) + 1)).toBe(
      false,
    );
    expect(
      isWithinPermitValidity(window, Date.parse(window.validFrom) - 1),
    ).toBe(false);
  });

  it("prefers the server-derived expiry flag", () => {
    expect(
      isPermitExpired(
        { status: "ACTIVE", validTo: window.validTo, isExpired: true },
        now,
      ),
    ).toBe(true);
    expect(
      isPermitExpired(
        { status: "ACTIVE", validTo: window.validTo, isExpired: false },
        now,
      ),
    ).toBe(false);
  });

  it("never treats terminal permits as expired work", () => {
    expect(
      isPermitExpired(
        { status: "CLOSED", validTo: "2020-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isPermitExpired(
        { status: "REJECTED", validTo: "2020-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isPermitExpired(
        { status: "CANCELLED", validTo: "2020-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("detects expiry for non-terminal permits", () => {
    expect(
      isPermitExpired(
        { status: "ACTIVE", validTo: "2020-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isPermitExpired({ status: "ACTIVE", validTo: window.validTo }, now),
    ).toBe(false);
    expect(
      isPermitExpired({ status: "ACTIVE", validTo: "not-a-date" }, now),
    ).toBe(false);
  });

  it("only offers activation inside the validity window", () => {
    expect(canUsePermitNow({ status: "APPROVED", ...window }, now)).toBe(true);
    expect(canUsePermitNow({ status: "SUSPENDED", ...window }, now)).toBe(true);
    expect(
      canUsePermitNow(
        { status: "APPROVED", ...window },
        Date.parse(window.validTo) + 1,
      ),
    ).toBe(false);
    expect(canUsePermitNow({ status: "DRAFT", ...window }, now)).toBe(false);
  });
});

describe("permit form helpers", () => {
  it("splits workers on new lines and commas, trimming and dropping blanks", () => {
    expect(
      parseWorkersInvolved(
        "Ade Worker — welder\nBola Helper — fitter\n\n  Chidi Rigger  \n",
      ),
    ).toEqual(["Ade Worker — welder", "Bola Helper — fitter", "Chidi Rigger"]);

    expect(parseWorkersInvolved("One,Two, ,Three")).toEqual([
      "One",
      "Two",
      "Three",
    ]);
    expect(parseWorkersInvolved("   \n , \n")).toEqual([]);
  });

  it("labels every closure check", () => {
    expect(Object.keys(PERMIT_CLOSURE_CHECK_LABELS)).toEqual([
      "workAreaSecured",
      "personnelAccountedFor",
      "equipmentIsolated",
      "siteHandoverCompleted",
    ]);
  });

  it("uses a 20-row register page by default", () => {
    expect(PERMIT_PAGE_SIZE).toBe(20);
  });
});

describe("permit risk assessment links", () => {
  const projectId = "507f1f77bcf86cd799439011";
  const siteId = "507f1f77bcf86cd799439012";

  function assessment(
    overrides: Partial<
      Pick<
        RiskAssessmentSummary,
        "status" | "supersededBy" | "project" | "site"
      >
    > = {},
  ): Pick<
    RiskAssessmentSummary,
    "status" | "supersededBy" | "project" | "site"
  > {
    return {
      status: "APPROVED" as const,
      supersededBy: null,
      project: { id: projectId, name: "Project" },
      site: { id: siteId, name: "Site", code: "S1" },
      ...overrides,
    };
  }

  it("only accepts current approved assessments for the exact project and site", () => {
    expect(
      isRiskAssessmentEligibleForPermit(assessment(), projectId, siteId),
    ).toBe(true);

    expect(
      isRiskAssessmentEligibleForPermit(
        assessment({ project: { id: "507f1f77bcf86cd799439099", name: null } }),
        projectId,
        siteId,
      ),
    ).toBe(false);

    expect(
      isRiskAssessmentEligibleForPermit(
        assessment({
          site: { id: "507f1f77bcf86cd799439098", name: null, code: null },
        }),
        projectId,
        siteId,
      ),
    ).toBe(false);

    expect(
      isRiskAssessmentEligibleForPermit(
        assessment({ site: null }),
        projectId,
        siteId,
      ),
    ).toBe(false);

    expect(
      isRiskAssessmentEligibleForPermit(
        assessment({ status: "DRAFT" }),
        projectId,
        siteId,
      ),
    ).toBe(false);

    expect(
      isRiskAssessmentEligibleForPermit(
        assessment({ status: "ARCHIVED" }),
        projectId,
        siteId,
      ),
    ).toBe(false);

    expect(
      isRiskAssessmentEligibleForPermit(
        assessment({ supersededBy: "507f1f77bcf86cd799439097" }),
        projectId,
        siteId,
      ),
    ).toBe(false);

    expect(isRiskAssessmentEligibleForPermit(assessment(), "", siteId)).toBe(
      false,
    );
    expect(isRiskAssessmentEligibleForPermit(assessment(), projectId, "")).toBe(
      false,
    );
  });

  it("toggles links without duplicates", () => {
    expect(toggleLinkedRiskAssessment([], "a")).toEqual(["a"]);
    expect(toggleLinkedRiskAssessment(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleLinkedRiskAssessment(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleLinkedRiskAssessment(["a", "b"], "c")).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("enforces the 10-link limit but still allows removals", () => {
    const ids = Array.from(
      { length: MAX_LINKED_RISK_ASSESSMENTS },
      (_, index) => `assessment-${index}`,
    );

    expect(MAX_LINKED_RISK_ASSESSMENTS).toBe(10);
    expect(toggleLinkedRiskAssessment(ids, "one-too-many")).toEqual(ids);
    expect(toggleLinkedRiskAssessment(ids, ids[0])).toEqual(ids.slice(1));
  });
});

describe("permit attention filters", () => {
  it("parses the expiring-soon attention filter and implies ACTIVE", () => {
    const filters = parsePermitFilters(
      new URLSearchParams({ attention: "ACTIVE_EXPIRING_SOON" }),
    );

    expect(filters.attention).toBe("ACTIVE_EXPIRING_SOON");
    expect(filters.status).toBe("ACTIVE");
  });

  it("ignores unknown attention values", () => {
    expect(
      parsePermitFilters(new URLSearchParams({ attention: "EXPIRED" }))
        .attention,
    ).toBe("");
    expect(
      parsePermitFilters(new URLSearchParams({ attention: "active" }))
        .attention,
    ).toBe("");
  });

  it("drops attention when the status conflicts", () => {
    const filters = parsePermitFilters(
      new URLSearchParams({
        attention: "ACTIVE_EXPIRING_SOON",
        status: "SUSPENDED",
      }),
    );

    expect(filters.attention).toBe("");
    expect(filters.status).toBe("SUSPENDED");
  });

  it("round-trips the attention filter through the URL", () => {
    const params = buildPermitFilterSearchParams({
      ...EMPTY_PERMIT_FILTERS,
      status: "ACTIVE",
      attention: "ACTIVE_EXPIRING_SOON",
    });

    expect(params.get("attention")).toBe("ACTIVE_EXPIRING_SOON");
    expect(parsePermitFilters(params)).toMatchObject({
      status: "ACTIVE",
      attention: "ACTIVE_EXPIRING_SOON",
    });
  });

  it("counts attention as an active filter", () => {
    expect(
      hasActivePermitFilters({
        ...EMPTY_PERMIT_FILTERS,
        attention: "ACTIVE_EXPIRING_SOON",
      }),
    ).toBe(true);
  });

  it("builds attention clicks that preserve site scope and reset paging", () => {
    const filters = {
      ...EMPTY_PERMIT_FILTERS,
      q: "tank",
      workType: "HOT_WORK" as const,
      responsiblePersonId: "507f1f77bcf86cd799439011",
      siteId: "507f1f77bcf86cd799439012",
      page: 4,
      limit: 50,
    };

    expect(permitAttentionFilters(filters, "SUSPENDED")).toEqual({
      q: "",
      workType: "",
      responsiblePersonId: "",
      status: "SUSPENDED",
      attention: "",
      siteId: filters.siteId,
      page: 1,
      limit: 50,
    });

    expect(permitAttentionFilters(filters, "SUBMITTED")).toMatchObject({
      status: "SUBMITTED",
      attention: "",
    });

    expect(
      permitAttentionFilters(filters, "ACTIVE_EXPIRING_SOON"),
    ).toMatchObject({
      status: "ACTIVE",
      attention: "ACTIVE_EXPIRING_SOON",
    });

    expect(PERMIT_ATTENTION_WINDOW_DAYS).toBe(7);
  });
});
