import { describe, expect, it } from "vitest";
import {
  buildDirectorySearchParams,
  EMPTY_DIRECTORY_FILTERS,
  parseDirectorySearchParams,
  type DirectoryFilterState,
} from "./directory-filters";

describe("parseDirectorySearchParams", () => {
  it("returns the default filter state for an empty query string", () => {
    expect(parseDirectorySearchParams(new URLSearchParams())).toEqual(
      EMPTY_DIRECTORY_FILTERS,
    );
  });

  it("round-trips a fully populated filter state", () => {
    const filters: DirectoryFilterState = {
      q: "ada lovelace",
      department: "507f1f77bcf86cd799439011",
      ikoshRole: "HSE_OFFICER",
      employmentType: "CONTRACT",
      isActive: "false",
      sort: "-hireDate",
      page: 3,
      limit: 50,
    };

    const parsed = parseDirectorySearchParams(
      buildDirectorySearchParams(filters),
    );

    expect(parsed).toEqual(filters);
  });

  it("falls back to the default sort for unknown values", () => {
    const parsed = parseDirectorySearchParams(
      new URLSearchParams("sort=bogus"),
    );

    expect(parsed.sort).toBe("name");
  });

  it("keeps valid negative-direction sorts", () => {
    const parsed = parseDirectorySearchParams(
      new URLSearchParams("sort=-name"),
    );

    expect(parsed.sort).toBe("-name");
  });

  it("clamps invalid pages and limits", () => {
    for (const query of ["page=0", "page=-3", "page=abc"]) {
      const parsed = parseDirectorySearchParams(new URLSearchParams(query));
      expect(parsed.page).toBe(1);
    }

    for (const query of ["limit=0", "limit=-1", "limit=abc", "limit=500"]) {
      const parsed = parseDirectorySearchParams(new URLSearchParams(query));
      expect(parsed.limit).toBe(20);
    }
  });

  it("keeps in-range pages and limits", () => {
    const parsed = parseDirectorySearchParams(
      new URLSearchParams("page=7&limit=100"),
    );

    expect(parsed).toMatchObject({ page: 7, limit: 100 });
  });
});

describe("buildDirectorySearchParams", () => {
  it("omits empty optional filters and always sets paging", () => {
    const params = buildDirectorySearchParams(EMPTY_DIRECTORY_FILTERS);

    expect(params.get("q")).toBeNull();
    expect(params.get("department")).toBeNull();
    expect(params.get("ikoshRole")).toBeNull();
    expect(params.get("employmentType")).toBeNull();
    expect(params.get("isActive")).toBeNull();
    expect(params.get("sort")).toBe("name");
    expect(params.get("page")).toBe("1");
    expect(params.get("limit")).toBe("20");
  });

  it("trims the search term", () => {
    const params = buildDirectorySearchParams({
      ...EMPTY_DIRECTORY_FILTERS,
      q: "   safety officer  ",
    });

    expect(params.get("q")).toBe("safety officer");
  });

  it("includes every active filter", () => {
    const params = buildDirectorySearchParams({
      ...EMPTY_DIRECTORY_FILTERS,
      q: "grace",
      department: "507f1f77bcf86cd799439011",
      ikoshRole: "SUPERVISOR",
      employmentType: "INTERN",
      isActive: "true",
      sort: "employeeId",
      page: 2,
      limit: 25,
    });

    expect(params.toString()).toBe(
      "q=grace&department=507f1f77bcf86cd799439011" +
        "&ikoshRole=SUPERVISOR&employmentType=INTERN&isActive=true" +
        "&sort=employeeId&page=2&limit=25",
    );
  });
});
