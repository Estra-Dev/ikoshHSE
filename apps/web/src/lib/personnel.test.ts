import { describe, expect, it } from "vitest";
import {
  buildPersonnelFilterSearchParams,
  buildPersonnelSearchParams,
  buildPersonnelSiteHref,
  EMPTY_PERSONNEL_FILTERS,
  getSiteAssignmentOption,
  parsePersonnelFilters,
} from "./personnel";

describe("buildPersonnelSearchParams", () => {
  it("omits empty filters and always sets paging", () => {
    const params = buildPersonnelSearchParams(EMPTY_PERSONNEL_FILTERS);

    expect(params.get("q")).toBeNull();
    expect(params.get("ikoshRole")).toBeNull();
    expect(params.get("siteId")).toBeNull();
    expect(params.get("isActive")).toBeNull();
    expect(params.get("sort")).toBe("name");
    expect(params.get("page")).toBe("1");
    expect(params.get("limit")).toBe("20");
  });

  it("includes role, site and status filters", () => {
    const params = buildPersonnelSearchParams({
      q: "  ada  ",
      ikoshRole: "HSE_OFFICER",
      siteId: "507f1f77bcf86cd799439011",
      isActive: "false",
      page: 2,
      limit: 50,
    });

    expect(params.get("q")).toBe("ada");
    expect(params.get("ikoshRole")).toBe("HSE_OFFICER");
    expect(params.get("siteId")).toBe("507f1f77bcf86cd799439011");
    expect(params.get("isActive")).toBe("false");
    expect(params.get("page")).toBe("2");
    expect(params.get("limit")).toBe("50");
  });
});

describe("personnel URL filters", () => {
  const SITE_ID = "507f1f77bcf86cd799439011";

  it("reads the site scope and preserves the other filters from the URL", () => {
    const filters = parsePersonnelFilters(
      new URLSearchParams(
        `siteId=${SITE_ID}&q=ada&ikoshRole=HSE_OFFICER&isActive=false&page=2&limit=50`,
      ),
    );

    expect(filters).toEqual({
      q: "ada",
      ikoshRole: "HSE_OFFICER",
      siteId: SITE_ID,
      isActive: "false",
      page: 2,
      limit: 50,
    });
  });

  it("falls back safely for malformed URL values", () => {
    const filters = parsePersonnelFilters(
      new URLSearchParams("siteId=not-an-id&ikoshRole=NOPE&isActive=true&page=0&limit=999"),
    );

    expect(filters).toEqual(EMPTY_PERSONNEL_FILTERS);
  });

  it("builds shareable URL state and omits defaults", () => {
    const params = buildPersonnelFilterSearchParams({
      ...EMPTY_PERSONNEL_FILTERS,
      siteId: SITE_ID,
    });

    expect(params.toString()).toBe(`siteId=${SITE_ID}`);
  });

  it("keeps search, role, status and paging when filters change", () => {
    const params = buildPersonnelFilterSearchParams({
      q: "  ada  ",
      ikoshRole: "HSE_MANAGER",
      siteId: SITE_ID,
      isActive: "false",
      page: 3,
      limit: 50,
    });

    expect(params.get("q")).toBe("ada");
    expect(params.get("ikoshRole")).toBe("HSE_MANAGER");
    expect(params.get("siteId")).toBe(SITE_ID);
    expect(params.get("isActive")).toBe("false");
    expect(params.get("page")).toBe("3");
    expect(params.get("limit")).toBe("50");
  });

  it("links site detail to the personnel directory scoped to that site", () => {
    expect(buildPersonnelSiteHref(SITE_ID)).toBe(`/personnel?siteId=${SITE_ID}`);
    expect(buildPersonnelSiteHref("")).toBe("/personnel");
  });
});

describe("site assignment options", () => {
  it("allows active sites to be newly assigned", () => {
    expect(
      getSiteAssignmentOption({ id: "site-1", status: "ACTIVE" }, []),
    ).toEqual({ checked: false, selectable: true, inactive: false });
  });

  it("keeps active assignments checked and removable", () => {
    expect(
      getSiteAssignmentOption({ id: "site-1", status: "ACTIVE" }, ["site-1"]),
    ).toEqual({ checked: true, selectable: true, inactive: false });
  });

  it("blocks new inactive assignments", () => {
    expect(
      getSiteAssignmentOption({ id: "site-2", status: "COMPLETED" }, []),
    ).toEqual({ checked: false, selectable: false, inactive: true });
  });

  it("shows existing inactive assignments so they can be removed", () => {
    expect(
      getSiteAssignmentOption({ id: "site-2", status: "COMPLETED" }, ["site-2"]),
    ).toEqual({ checked: true, selectable: true, inactive: true });
  });
});
