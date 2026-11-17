"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { PermitFilterState } from "@/lib/permits";
import { useApi } from "./client";
import type {
  CreatePermitInput,
  PermitAssigneesResponse,
  PermitResponse,
  PermitsResponse,
  UpdatePermitInput,
  UpdatePermitStatusInput,
} from "./types";

export const permitKeys = {
  all: ["permits"] as const,
  listRoot: ["permits", "list"] as const,
  list: (query: PermitFilterState) =>
    [...permitKeys.listRoot, query] as const,
  detailRoot: ["permits", "detail"] as const,
  detail: (id: string) => [...permitKeys.detailRoot, id] as const,
  assignees: (siteId: string) =>
    [...permitKeys.all, "assignees", siteId] as const,
};

/** Builds the register query; empty filters are omitted. */
function buildListSearchParams(query: PermitFilterState): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.q) searchParams.set("q", query.q);
  if (query.status) searchParams.set("status", query.status);
  if (query.workType) searchParams.set("workType", query.workType);
  if (query.siteId) searchParams.set("siteId", query.siteId);
  if (query.responsiblePersonId) {
    searchParams.set("responsiblePersonId", query.responsiblePersonId);
  }
  searchParams.set("page", String(query.page));
  searchParams.set("limit", String(query.limit));

  return searchParams;
}

/** Site- and role-scoped permit register. */
export function usePermits(query: PermitFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: permitKeys.list(query),
    queryFn: () =>
      api.get<PermitsResponse>("/api/permits", buildListSearchParams(query)),
    placeholderData: keepPreviousData,
  });
}

export function usePermit(id: string) {
  const api = useApi();

  return useQuery({
    queryKey: permitKeys.detail(id),
    queryFn: () => api.get<PermitResponse>(`/api/permits/${id}`),
    enabled: id.length > 0,
  });
}

/**
 * Active people eligible to be responsible for a permit. Supplying the site
 * narrows the list to people authorised for that site.
 */
export function usePermitAssignees(siteId = "") {
  const api = useApi();

  return useQuery({
    queryKey: permitKeys.assignees(siteId),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (siteId) searchParams.set("siteId", siteId);
      return api.get<PermitAssigneesResponse>(
        "/api/permits/assignees",
        searchParams,
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidatePermits() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: permitKeys.all });
  };
}

export function useCreatePermit() {
  const api = useApi();
  const invalidate = useInvalidatePermits();

  return useMutation({
    mutationFn: (input: CreatePermitInput) =>
      api.post<PermitResponse>("/api/permits", input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePermit() {
  const api = useApi();
  const invalidate = useInvalidatePermits();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePermitInput }) =>
      api.patch<PermitResponse>(`/api/permits/${id}`, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePermitStatus() {
  const api = useApi();
  const invalidate = useInvalidatePermits();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdatePermitStatusInput;
    }) => api.patch<PermitResponse>(`/api/permits/${id}/status`, input),
    onSuccess: () => invalidate(),
  });
}
