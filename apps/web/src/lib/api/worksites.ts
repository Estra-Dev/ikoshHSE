"use client";

import { useQuery } from "@tanstack/react-query";
import {
  buildProjectListSearchParams,
  buildSiteListSearchParams,
} from "@/lib/hse-dashboard";
import { useApi } from "./client";
import type { ProjectsResponse, SitesResponse } from "./types";

export const workSiteKeys = {
  all: ["worksites"] as const,
  projects: () => [...workSiteKeys.all, "projects"] as const,
  sites: (projectId: string) =>
    [...workSiteKeys.all, "sites", projectId] as const,
};

/** Bounded active-project list for dashboard scope controls. */
export function useProjects() {
  const api = useApi();

  return useQuery({
    queryKey: workSiteKeys.projects(),
    queryFn: () =>
      api.get<ProjectsResponse>(
        "/api/projects",
        buildProjectListSearchParams(),
      ),
  });
}

/** Bounded, site-scoped list for filters and site-name lookups. */
export function useSites({ projectId = "" }: { projectId?: string } = {}) {
  const api = useApi();

  return useQuery({
    queryKey: workSiteKeys.sites(projectId),
    queryFn: () =>
      api.get<SitesResponse>(
        "/api/sites",
        buildSiteListSearchParams({ projectId }),
      ),
  });
}
