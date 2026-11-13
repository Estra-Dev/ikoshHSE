"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  buildProjectsSearchParams,
  buildSitesSearchParams,
  type SiteListQuery,
  type WorkSiteListQuery,
} from "@/lib/worksites";
import { useApi } from "./client";
import type {
  ProjectResponse,
  ProjectsResponse,
  SiteResponse,
  SitesResponse,
} from "./types";

export const workSiteKeys = {
  all: ["worksites"] as const,
  projects: (query: WorkSiteListQuery) =>
    [...workSiteKeys.all, "projects", query] as const,
  project: (id: string) => [...workSiteKeys.all, "project", id] as const,
  sites: (query: SiteListQuery) =>
    [...workSiteKeys.all, "sites", query] as const,
  site: (id: string) => [...workSiteKeys.all, "site", id] as const,
};

export interface ProjectInput {
  name: string;
  code: string;
  description?: string | null;
  client?: string | null;
  location?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface SiteInput {
  projectId: string;
  name: string;
  code: string;
  location?: string | null;
  description?: string | null;
  status?: string;
}

/** Bounded project list for dashboard scope controls and management screens. */
export function useProjects({
  page = 1,
  limit = 100,
  includeInactive = false,
}: WorkSiteListQuery = {}) {
  const api = useApi();
  const query = { page, limit, includeInactive };

  return useQuery({
    queryKey: workSiteKeys.projects(query),
    queryFn: () =>
      api.get<ProjectsResponse>(
        "/api/projects",
        buildProjectsSearchParams(query),
      ),
    placeholderData: keepPreviousData,
  });
}

/** Project detail, subject to the API's active-project visibility rules. */
export function useProject(
  id: string,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: workSiteKeys.project(id),
    queryFn: () => api.get<ProjectResponse>(`/api/projects/${id}`),
    enabled: options.enabled !== false && Boolean(id),
  });
}

/** Bounded, site-scoped list for filters, dashboards and site lookups. */
export function useSites({
  projectId = "",
  includeInactive = false,
  page = 1,
  limit = 100,
}: SiteListQuery = {}) {
  const api = useApi();
  const query = { projectId, includeInactive, page, limit };

  return useQuery({
    queryKey: workSiteKeys.sites(query),
    queryFn: () =>
      api.get<SitesResponse>("/api/sites", buildSitesSearchParams(query)),
    placeholderData: keepPreviousData,
  });
}

/** Site detail, subject to the API's site-access and lifecycle rules. */
export function useSite(id: string, options: { enabled?: boolean } = {}) {
  const api = useApi();

  return useQuery({
    queryKey: workSiteKeys.site(id),
    queryFn: () => api.get<SiteResponse>(`/api/sites/${id}`),
    enabled: options.enabled !== false && Boolean(id),
  });
}

function useInvalidateWorksites() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: workSiteKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["hse", "dashboard"] });
  };
}

export function useCreateProject() {
  const api = useApi();
  const invalidate = useInvalidateWorksites();

  return useMutation({
    mutationFn: (input: ProjectInput) =>
      api.post<ProjectResponse>("/api/projects", input),
    onSuccess: invalidate,
  });
}

export function useUpdateProject() {
  const api = useApi();
  const invalidate = useInvalidateWorksites();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<ProjectInput>;
    }) => api.patch<ProjectResponse>(`/api/projects/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const api = useApi();
  const invalidate = useInvalidateWorksites();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean; message: string }>(`/api/projects/${id}`),
    onSuccess: invalidate,
  });
}

export function useCreateSite() {
  const api = useApi();
  const invalidate = useInvalidateWorksites();

  return useMutation({
    mutationFn: (input: SiteInput) =>
      api.post<SiteResponse>("/api/sites", input),
    onSuccess: invalidate,
  });
}

export function useUpdateSite() {
  const api = useApi();
  const invalidate = useInvalidateWorksites();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<SiteInput>;
    }) => api.patch<SiteResponse>(`/api/sites/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSite() {
  const api = useApi();
  const invalidate = useInvalidateWorksites();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean; message: string }>(`/api/sites/${id}`),
    onSuccess: invalidate,
  });
}
