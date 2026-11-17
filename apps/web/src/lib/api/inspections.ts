"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InspectionFilterState } from "@/lib/inspections";
import { useApi } from "./client";
import { correctiveActionKeys } from "./corrective-actions";
import { hseKeys } from "./hse";
import type {
  CreateInspectionFindingInput,
  CreateInspectionInput,
  InspectionAssigneesResponse,
  InspectionCorrectiveActionResponse,
  InspectionResponse,
  InspectionsResponse,
  LinkInspectionCorrectiveActionInput,
  UpdateInspectionInput,
  UpdateInspectionStatusInput,
} from "./types";

export const inspectionKeys = {
  all: ["inspections"] as const,
  listRoot: ["inspections", "list"] as const,
  list: (query: InspectionFilterState) =>
    [...inspectionKeys.listRoot, query] as const,
  detailRoot: ["inspections", "detail"] as const,
  detail: (id: string) => [...inspectionKeys.detailRoot, id] as const,
  assignees: () => [...inspectionKeys.all, "assignees"] as const,
};

/** Builds the register query; empty filters are omitted. */
function buildListSearchParams(
  query: InspectionFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.q) searchParams.set("q", query.q);
  if (query.status) searchParams.set("status", query.status);
  if (query.type) searchParams.set("type", query.type);
  if (query.siteId) searchParams.set("siteId", query.siteId);
  if (query.inspectorId) searchParams.set("inspectorId", query.inspectorId);
  searchParams.set("page", String(query.page));
  searchParams.set("limit", String(query.limit));

  return searchParams;
}

/** Site- and role-scoped inspection register. */
export function useInspections(query: InspectionFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: inspectionKeys.list(query),
    queryFn: () =>
      api.get<InspectionsResponse>(
        "/api/inspections",
        buildListSearchParams(query),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useInspection(id: string) {
  const api = useApi();

  return useQuery({
    queryKey: inspectionKeys.detail(id),
    queryFn: () => api.get<InspectionResponse>(`/api/inspections/${id}`),
    enabled: id.length > 0,
  });
}

/** Active HSE staff that may be responsible for an inspection. */
export function useInspectionAssignees() {
  const api = useApi();

  return useQuery({
    queryKey: inspectionKeys.assignees(),
    queryFn: () =>
      api.get<InspectionAssigneesResponse>("/api/inspections/assignees"),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateInspections() {
  const queryClient = useQueryClient();

  return (options: { correctiveActions?: boolean } = {}) => {
    void queryClient.invalidateQueries({ queryKey: inspectionKeys.all });
    void queryClient.invalidateQueries({ queryKey: hseKeys.dashboardRoot });

    if (options.correctiveActions) {
      void queryClient.invalidateQueries({ queryKey: correctiveActionKeys.all });
    }
  };
}

export function useCreateInspection() {
  const api = useApi();
  const invalidate = useInvalidateInspections();

  return useMutation({
    mutationFn: (input: CreateInspectionInput) =>
      api.post<InspectionResponse>("/api/inspections", input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateInspection() {
  const api = useApi();
  const invalidate = useInvalidateInspections();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateInspectionInput;
    }) => api.patch<InspectionResponse>(`/api/inspections/${id}`, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateInspectionStatus() {
  const api = useApi();
  const invalidate = useInvalidateInspections();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateInspectionStatusInput;
    }) =>
      api.patch<InspectionResponse>(`/api/inspections/${id}/status`, input),
    onSuccess: () => invalidate(),
  });
}

export function useAddInspectionFinding() {
  const api = useApi();
  const invalidate = useInvalidateInspections();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: CreateInspectionFindingInput;
    }) =>
      api.post<InspectionResponse>(`/api/inspections/${id}/findings`, input),
    onSuccess: () => invalidate(),
  });
}

/**
 * Raises a corrective action from one finding. The API writes the CAPA, the
 * finding backlink and both audit rows atomically, so both caches are
 * invalidated on success.
 */
export function useLinkInspectionCorrectiveAction() {
  const api = useApi();
  const invalidate = useInvalidateInspections();

  return useMutation({
    mutationFn: ({
      inspectionId,
      findingId,
      input,
    }: {
      inspectionId: string;
      findingId: string;
      input: LinkInspectionCorrectiveActionInput;
    }) =>
      api.post<InspectionCorrectiveActionResponse>(
        `/api/inspections/${inspectionId}/findings/${findingId}/corrective-action`,
        input,
      ),
    onSuccess: () => invalidate({ correctiveActions: true }),
  });
}
