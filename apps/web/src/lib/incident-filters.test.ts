import { describe, expect, it } from "vitest";
import {
  buildIncidentFilterSearchParams,
  EMPTY_INCIDENT_FILTERS,
  hasActiveIncidentFilters,
  parseIncidentFilters,
  type IncidentFilterState,
} from "./incident-filters";

const SITE_ID = "507f1f77bcf86cd799439011";

describe("parseIncidentFilters", () => {
  it("returns the default state for an empty query string", () => {
    expect(parseIncidentFilters(new URLSearchParams())).toEqual(
      EMPTY_INCIDENT_FILTERS,
    );
  });

  it("falls back safely for malformed values", () => {
    const parsed = parseIncidentFilters(
      new URLSearchParams({
        siteId: "not-an-object-id",
        status: "OPEN",
        type: "HAZARD",
        page: "0",
        limit: "500",
      }),
    );

    expect(parsed).toEqual(EMPTY_INCIDENT_FILTERS);
  });

  it("round-trips a fully populated filter state", () => {
    const filters: IncidentFilterState = {
      siteId: SITE_ID,
      status: "TRIAGED",
      type: "NEAR_MISS",
      page: 3,
      limit: 50,
    };

    expect(
      parseIncidentFilters(buildIncidentFilterSearchParams(filters)),
    ).toEqual(filters);
  });

  it("enforces a locked type regardless of the URL", () => {
    const parsed = parseIncidentFilters(
      new URLSearchParams({ type: "INCIDENT", page: "2" }),
      { lockedType: "NEAR_MISS" },
    );

    expect(parsed.type).toBe("NEAR_MISS");
    expect(parsed.page).toBe(2);
  });
});

describe("buildIncidentFilterSearchParams", () => {
  it("omits defaults and never writes a locked type", () => {
    const params = buildIncidentFilterSearchParams(
      { ...EMPTY_INCIDENT_FILTERS, type: "NEAR_MISS", page: 1 },
      { lockedType: "NEAR_MISS" },
    );

    expect(params.toString()).toBe("");
  });

  it("writes site, status, type and non-default paging", () => {
    const params = buildIncidentFilterSearchParams({
      siteId: SITE_ID,
      status: "CLOSED",
      type: "INCIDENT",
      page: 2,
      limit: 50,
    });

    expect(params.get("siteId")).toBe(SITE_ID);
    expect(params.get("status")).toBe("CLOSED");
    expect(params.get("type")).toBe("INCIDENT");
    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("50");
  });
});

describe("hasActiveIncidentFilters", () => {
  it("ignores paging but reports real filters", () => {
    expect(hasActiveIncidentFilters(EMPTY_INCIDENT_FILTERS)).toBe(false);
    expect(
      hasActiveIncidentFilters({ ...EMPTY_INCIDENT_FILTERS, page: 4 }),
    ).toBe(false);
    expect(
      hasActiveIncidentFilters({ ...EMPTY_INCIDENT_FILTERS, status: "REPORTED" }),
    ).toBe(true);
  });

  it("ignores the type when the route locks it", () => {
    const filters: IncidentFilterState = {
      ...EMPTY_INCIDENT_FILTERS,
      type: "NEAR_MISS",
    };

    expect(
      hasActiveIncidentFilters(filters, { lockedType: "NEAR_MISS" }),
    ).toBe(false);
  });
});
