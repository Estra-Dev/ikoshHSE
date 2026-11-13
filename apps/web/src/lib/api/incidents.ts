"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  buildIncidentListSearchParams,
  type IncidentListQuery,
} from "@/lib/hse-dashboard";
import { useApi } from "./client";
import { hseKeys } from "./hse";
import type {
  ClassifyIncidentInput,
  CreateIncidentInput,
  IncidentResponse,
  IncidentsResponse,
  UpdateIncidentInput,
  UpdateIncidentStatusInput,
} from "./types";

export const incidentKeys = {
  all: ["incidents"] as const,
  listRoot: ["incidents", "list"] as const,
  list: (query: IncidentListQuery) =>
    [...incidentKeys.listRoot, query] as const,
  detailRoot: ["incidents", "detail"] as const,
  detail: (id: string) => [...incidentKeys.detailRoot, id] as const,
};

/**
 * Dashboard totals and recent-report feeds are derived from incident data, so
 * every incident mutation refreshes them alongside the registers.
 */

function useInvalidateIncidentData() {
  const queryClient = useQueryClient();

  return (incidentId?: string) => {
    const invalidations = [
      queryClient.invalidateQueries({
        queryKey: incidentKeys.all,
      }),
      queryClient.invalidateQueries({
        queryKey: hseKeys.dashboardRoot,
        refetchType: "all",
      }),
      queryClient.invalidateQueries({
        queryKey: hseKeys.incidentsRoot,
      }),
    ];

    if (incidentId) {
      invalidations.push(
        queryClient.invalidateQueries({
          queryKey: incidentKeys.detail(incidentId),
        }),
      );
    }

    return Promise.all(invalidations);
  };
}

/** Paginated, site-scoped incident and near-miss register query. */
export function useIncidents(query: IncidentListQuery) {
  const api = useApi();

  return useQuery({
    queryKey: incidentKeys.list(query),
    queryFn: () =>
      api.get<IncidentsResponse>(
        "/api/incidents",
        buildIncidentListSearchParams(query),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useIncident(id: string | null) {
  const api = useApi();

  return useQuery({
    queryKey: incidentKeys.detail(id ?? "none"),
    queryFn: () => api.get<IncidentResponse>(`/api/incidents/${id ?? ""}`),
    enabled: id !== null && id.length > 0,
  });
}

export function useCreateIncident() {
  const api = useApi();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateIncidentData();

  return useMutation({
    mutationFn: (input: CreateIncidentInput) =>
      api.post<IncidentResponse>("/api/incidents", input),
    onSuccess: ({ incident }) => {
      queryClient.setQueryData(incidentKeys.detail(incident.id), {
        success: true,
        incident,
      });
      invalidate(incident.id);
    },
  });
}

export function useUpdateIncident() {
  const api = useApi();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateIncidentData();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIncidentInput }) =>
      api.patch<IncidentResponse>(`/api/incidents/${id}`, input),
    onSuccess: ({ incident }) => {
      queryClient.setQueryData(incidentKeys.detail(incident.id), {
        success: true,
        incident,
      });
      invalidate(incident.id);
    },
  });
}

export function useClassifyIncident() {
  const api = useApi();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateIncidentData();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClassifyIncidentInput }) =>
      api.patch<IncidentResponse>(`/api/incidents/${id}/classification`, input),
    onSuccess: ({ incident }) => {
      queryClient.setQueryData(incidentKeys.detail(incident.id), {
        success: true,
        incident,
      });
      invalidate(incident.id);
    },
  });
}

export function useUpdateIncidentStatus() {
  const api = useApi();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateIncidentData();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateIncidentStatusInput;
    }) => api.patch<IncidentResponse>(`/api/incidents/${id}/status`, input),
    onSuccess: ({ incident }) => {
      queryClient.setQueryData(incidentKeys.detail(incident.id), {
        success: true,
        incident,
      });
      invalidate(incident.id);
    },
  });
}
