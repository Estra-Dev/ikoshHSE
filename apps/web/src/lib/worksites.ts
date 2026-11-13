/**
 * Pure helpers for the HSE worksites (projects and sites) screens.
 *
 * Kept free of React and network imports so query construction and form
 * value conversion can be unit-tested directly.
 */

/** Fallback lifecycle values mirroring the API constants. */
export const DEFAULT_PROJECT_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

/** Fallback lifecycle values mirroring the API constants. */
export const DEFAULT_SITE_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "DECOMMISSIONED",
] as const;

export interface WorkSiteListQuery {
  page?: number;
  limit?: number;
  includeInactive?: boolean;
}

export interface SiteListQuery extends WorkSiteListQuery {
  projectId?: string;
}

/** Builds `/api/projects` query parameters. */
export function buildProjectsSearchParams(
  query: WorkSiteListQuery = {},
): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(query.page ?? 1));
  searchParams.set("limit", String(query.limit ?? 100));

  if (query.includeInactive) {
    searchParams.set("includeInactive", "true");
  }

  return searchParams;
}

/** Builds `/api/sites` query parameters, including the optional project scope. */
export function buildSitesSearchParams(
  query: SiteListQuery = {},
): URLSearchParams {
  const searchParams = buildProjectsSearchParams(query);

  if (query.projectId) {
    searchParams.set("projectId", query.projectId);
  }

  return searchParams;
}

/** Converts an API ISO date into a `YYYY-MM-DD` value for `<input type="date">`. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

/** Converts a date input value into the ISO string expected by the API. */
export function toApiDate(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}
