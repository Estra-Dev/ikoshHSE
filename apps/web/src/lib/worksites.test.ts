import { describe, expect, it } from "vitest";
import {
  buildProjectsSearchParams,
  buildSitesSearchParams,
  toApiDate,
  toDateInputValue,
} from "./worksites";

describe("worksite query builders", () => {
  it("builds bounded project list parameters", () => {
    const params = buildProjectsSearchParams({
      page: 2,
      limit: 20,
      includeInactive: true,
    });

    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("20");
    expect(params.get("includeInactive")).toBe("true");
  });

  it("defaults to the first page and the bounded lookup limit", () => {
    const params = buildProjectsSearchParams();

    expect(params.get("page")).toBe("1");
    expect(params.get("limit")).toBe("100");
    expect(params.has("includeInactive")).toBe(false);
  });

  it("adds the project scope to site list parameters", () => {
    const params = buildSitesSearchParams({
      projectId: "507f1f77bcf86cd799439011",
      page: 3,
      limit: 20,
    });

    expect(params.get("projectId")).toBe("507f1f77bcf86cd799439011");
    expect(params.get("page")).toBe("3");
    expect(params.get("limit")).toBe("20");
  });
});

describe("worksite date conversion", () => {
  it("converts API dates to date input values", () => {
    expect(toDateInputValue("2026-02-01T08:00:00.000Z")).toBe("2026-02-01");
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("not-a-date")).toBe("");
  });

  it("converts date input values to ISO strings", () => {
    expect(toApiDate("2026-02-01")).toBe("2026-02-01T00:00:00.000Z");
    expect(toApiDate("")).toBeNull();
  });
});
