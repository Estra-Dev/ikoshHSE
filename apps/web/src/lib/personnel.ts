/**
 * Pure query helpers for the HSE personnel access directory.
 *
 * Kept free of React and network imports so they can be unit-tested directly.
 */

import { IKOSH_ROLES } from "./api/types";

export interface PersonnelDirectoryFilters {
  q: string;
  ikoshRole: string;
  siteId: string;
  isActive: string;
  page: number;
  limit: number;
}

export const EMPTY_PERSONNEL_FILTERS: PersonnelDirectoryFilters = {
  q: "",
  ikoshRole: "",
  siteId: "",
  isActive: "",
  page: 1,
  limit: 20,
};

export const PERSONNEL_BASE_PATH = "/personnel";

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/** Builds the API query string for the personnel directory. */
export function buildPersonnelSearchParams(
  filters: PersonnelDirectoryFilters,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q.trim()) {
    searchParams.set("q", filters.q.trim());
  }

  if (filters.ikoshRole) {
    searchParams.set("ikoshRole", filters.ikoshRole);
  }

  if (filters.siteId) {
    searchParams.set("siteId", filters.siteId);
  }

  if (filters.isActive) {
    searchParams.set("isActive", filters.isActive);
  }

  searchParams.set("sort", "name");
  searchParams.set("page", String(filters.page));
  searchParams.set("limit", String(filters.limit));

  return searchParams;
}

/**
 * Parses directory filters from the URL. Malformed values fall back to the
 * defaults so a shared or hand-edited link cannot trigger an API 400.
 */
export function parsePersonnelFilters(
  searchParams: URLSearchParams,
): PersonnelDirectoryFilters {
  const rawRole = searchParams.get("ikoshRole") ?? "";
  const rawSiteId = searchParams.get("siteId") ?? "";
  const rawStatus = searchParams.get("isActive");
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10);

  return {
    q: searchParams.get("q") ?? "",
    ikoshRole: (IKOSH_ROLES as readonly string[]).includes(rawRole)
      ? rawRole
      : "",
    siteId: OBJECT_ID_PATTERN.test(rawSiteId) ? rawSiteId : "",
    isActive: rawStatus === "false" ? "false" : "",
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) && limit >= 1 && limit <= 100 ? limit : 20,
  };
}

/**
 * Builds shareable directory URL state. Defaults are omitted so links stay
 * short; the site filter is preserved for links from site detail.
 */
export function buildPersonnelFilterSearchParams(
  filters: PersonnelDirectoryFilters,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q.trim()) {
    searchParams.set("q", filters.q.trim());
  }

  if (filters.ikoshRole) {
    searchParams.set("ikoshRole", filters.ikoshRole);
  }

  if (filters.siteId) {
    searchParams.set("siteId", filters.siteId);
  }

  if (filters.isActive) {
    searchParams.set("isActive", filters.isActive);
  }

  if (filters.page > 1) {
    searchParams.set("page", String(filters.page));
  }

  if (filters.limit !== EMPTY_PERSONNEL_FILTERS.limit) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Link from site detail to the personnel directory scoped to that site. */
export function buildPersonnelSiteHref(siteId: string): string {
  const searchParams = new URLSearchParams();

  if (siteId) {
    searchParams.set("siteId", siteId);
  }

  const query = searchParams.toString();

  return query ? `${PERSONNEL_BASE_PATH}?${query}` : PERSONNEL_BASE_PATH;
}

export interface SiteAssignmentOption {
  checked: boolean;
  selectable: boolean;
  inactive: boolean;
}

/**
 * Mirrors `PATCH /api/employees/:id/sites`: active sites can always be
 * toggled, while inactive sites are visible only when currently assigned and
 * can only be removed.
 */
export function getSiteAssignmentOption(
  site: { id: string; status: string },
  selectedSiteIds: readonly string[],
): SiteAssignmentOption {
  const checked = selectedSiteIds.includes(site.id);
  const inactive = site.status !== "ACTIVE";

  return {
    checked,
    selectable: !inactive || checked,
    inactive,
  };
}
