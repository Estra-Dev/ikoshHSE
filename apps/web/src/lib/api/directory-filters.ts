/**
 * Pure URL-state helpers for the employee directory.
 *
 * The directory page mirrors its filter state into the URL query string so
 * filtered views are shareable and survive refreshes. These helpers are kept
 * free of React and network imports so they can be unit-tested directly.
 */

export const DIRECTORY_SORT_OPTIONS = [
  "name",
  "-name",
  "employeeId",
  "-employeeId",
  "hireDate",
  "-hireDate",
  "createdAt",
  "-createdAt",
] as const;

export type DirectorySort = (typeof DIRECTORY_SORT_OPTIONS)[number];

/** Filter state for the employee directory, mirrored into the URL. */
export interface DirectoryFilterState {
  q: string;
  department: string;
  ikoshRole: string;
  employmentType: string;
  isActive: string;
  sort: DirectorySort;
  page: number;
  limit: number;
}

export const EMPTY_DIRECTORY_FILTERS: DirectoryFilterState = {
  q: "",
  department: "",
  ikoshRole: "",
  employmentType: "",
  isActive: "",
  sort: "name",
  page: 1,
  limit: 20,
};

/** Builds the API query string for a directory filter state. */
export function buildDirectorySearchParams(
  filters: DirectoryFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q.trim()) {
    searchParams.set("q", filters.q.trim());
  }

  if (filters.department) {
    searchParams.set("department", filters.department);
  }

  if (filters.ikoshRole) {
    searchParams.set("ikoshRole", filters.ikoshRole);
  }

  if (filters.employmentType) {
    searchParams.set("employmentType", filters.employmentType);
  }

  if (filters.isActive) {
    searchParams.set("isActive", filters.isActive);
  }

  searchParams.set("sort", filters.sort);
  searchParams.set("page", String(filters.page));
  searchParams.set("limit", String(filters.limit));

  return searchParams;
}

/** Parses directory filter state from URL search params. */
export function parseDirectorySearchParams(
  searchParams: URLSearchParams,
): DirectoryFilterState {
  const rawSort = searchParams.get("sort") ?? "name";
  const sort = (DIRECTORY_SORT_OPTIONS as readonly string[]).includes(rawSort)
    ? (rawSort as DirectorySort)
    : "name";

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10);

  return {
    q: searchParams.get("q") ?? "",
    department: searchParams.get("department") ?? "",
    ikoshRole: searchParams.get("ikoshRole") ?? "",
    employmentType: searchParams.get("employmentType") ?? "",
    isActive: searchParams.get("isActive") ?? "",
    sort,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) && limit >= 1 && limit <= 100 ? limit : 20,
  };
}
