"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { CorrectiveActionFilterState } from "@/lib/corrective-actions";
import { useApi } from "./client";
import { hseKeys } from "./hse";
import type {
  CorrectiveActionAssigneesResponse,
  CorrectiveActionResponse,
  CorrectiveActionsResponse,
  CreateCorrectiveActionInput,
  UpdateCorrectiveActionInput,
  UpdateCorrectiveActionStatusInput,
} from "./types";

export const correctiveActionKeys = {
  all: ["corrective-actions"] as const,
  listRoot: ["corrective-actions", "list"] as const,
  list: (query: CorrectiveActionFilterState) =>
    [...correctiveActionKeys.listRoot, query] as const,
  detailRoot: ["corrective-actions", "detail"] as const,
  detail: (id: string) => [...correctiveActionKeys.detailRoot, id] as const,
  assignees: () => [...correctiveActionKeys.all, "assignees"] as const,
};

/** Builds the register query; empty filters are omitted. */
function buildListSearchParams(
  query: CorrectiveActionFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.siteId) searchParams.set("siteId", query.siteId);
  if (query.status) searchParams.set("status", query.status);
  if (query.source) searchParams.set("source", query.source);
  if (query.overdue) searchParams.set("overdue", "true");
  searchParams.set("page", String(query.page));
  searchParams.set("limit", String(query.limit));

  return searchParams;
}

/**
 * Site- and role-scoped corrective action register. The API limits visibility
 * to HSE management, the assignee and staff at the action site.
 */
export function useCorrectiveActions(query: CorrectiveActionFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: correctiveActionKeys.list(query),
    queryFn: () =>
      api.get<CorrectiveActionsResponse>(
        "/api/corrective-actions",
        buildListSearchParams(query),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCorrectiveAction(id: string) {
  const api = useApi();

  return useQuery({
    queryKey: correctiveActionKeys.detail(id),
    queryFn: () =>
      api.get<CorrectiveActionResponse>(`/api/corrective-actions/${id}`),
    enabled: id.length > 0,
  });
}

/** Active HSE staff that may own a corrective action. */
export function useCorrectiveActionAssignees() {
  const api = useApi();

  return useQuery({
    queryKey: correctiveActionKeys.assignees(),
    queryFn: () =>
      api.get<CorrectiveActionAssigneesResponse>(
        "/api/corrective-actions/assignees",
      ),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateCorrectiveActions() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: correctiveActionKeys.all });
    void queryClient.invalidateQueries({ queryKey: hseKeys.dashboardRoot });
  };
}

export function useCreateCorrectiveAction() {
  const api = useApi();
  const invalidate = useInvalidateCorrectiveActions();

  return useMutation({
    mutationFn: (input: CreateCorrectiveActionInput) =>
      api.post<CorrectiveActionResponse>("/api/corrective-actions", input),
    onSuccess: invalidate,
  });
}

export function useUpdateCorrectiveAction() {
  const api = useApi();
  const invalidate = useInvalidateCorrectiveActions();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateCorrectiveActionInput;
    }) =>
      api.patch<CorrectiveActionResponse>(
        `/api/corrective-actions/${id}`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateCorrectiveActionStatus() {
  const api = useApi();
  const invalidate = useInvalidateCorrectiveActions();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateCorrectiveActionStatusInput;
    }) =>
      api.patch<CorrectiveActionResponse>(
        `/api/corrective-actions/${id}/status`,
        input,
      ),
    onSuccess: invalidate,
  });
}
