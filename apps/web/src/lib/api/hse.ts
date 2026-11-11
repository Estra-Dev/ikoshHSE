"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import {
  buildDashboardSearchParams,
  buildIncidentListSearchParams,
  MAX_COMPARISON_SITES,
  type DashboardScopeFilters,
} from "@/lib/hse-dashboard";
import { useApi } from "./client";
import type {
  HseDashboardResponse,
  IncidentType,
  IncidentsResponse,
} from "./types";

export const hseKeys = {
  all: ["hse"] as const,
  dashboardRoot: ["hse", "dashboard"] as const,
  dashboard: (filters: DashboardScopeFilters) =>
    [...hseKeys.dashboardRoot, filters] as const,
  incidentsRoot: ["hse", "incidents"] as const,
  recentIncidents: (query: {
    siteId: string;
    type: string;
    limit: number;
  }) => [...hseKeys.incidentsRoot, "recent", query] as const,
};

/** Site- and role-scoped HSE dashboard aggregates. */
export function useHseDashboard(
  filters: DashboardScopeFilters,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: hseKeys.dashboard(filters),
    queryFn: () =>
      api.get<HseDashboardResponse>(
        "/api/hse/dashboard",
        buildDashboardSearchParams(filters),
      ),
    enabled: options.enabled ?? true,
  });
}

/**
 * Per-site dashboard aggregates for the comparison panel. The caller passes an
 * already-bounded site list; the hook additionally caps it so a dashboard
 * render can never exceed four comparison requests.
 */
export function useSiteHseDashboards(
  filters: DashboardScopeFilters,
  siteIds: readonly string[],
) {
  const api = useApi();
  const comparable = siteIds.slice(0, MAX_COMPARISON_SITES);

  return useQueries({
    queries: comparable.map((siteId) => {
      const siteFilters: DashboardScopeFilters = { ...filters, siteId };

      return {
        queryKey: hseKeys.dashboard(siteFilters),
        queryFn: () =>
          api.get<HseDashboardResponse>(
            "/api/hse/dashboard",
            buildDashboardSearchParams(siteFilters),
          ),
        enabled: comparable.length > 0 && !filters.siteId,
      };
    }),
  });
}

export interface RecentIncidentsQuery {
  siteId?: string;
  type?: IncidentType;
  limit?: number;
  enabled?: boolean;
}

/**
 * Latest reports for the dashboard. This is intentionally a small, bounded
 * query; the incident register owns paging in a later stage.
 */
export function useRecentIncidents({
  siteId = "",
  type,
  limit = 5,
  enabled = true,
}: RecentIncidentsQuery = {}) {
  const api = useApi();
  const query = { siteId, type: type ?? "", limit };

  return useQuery({
    queryKey: hseKeys.recentIncidents(query),
    queryFn: () =>
      api.get<IncidentsResponse>(
        "/api/incidents",
        buildIncidentListSearchParams({ siteId, type, limit }),
      ),
    enabled,
  });
}
