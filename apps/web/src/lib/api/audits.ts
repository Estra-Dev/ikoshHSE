"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AuditFilterState } from "@/lib/audits";
import { useApi } from "./client";
import { correctiveActionKeys } from "./corrective-actions";
import { hseKeys } from "./hse";
import type {
  AuditAssigneesResponse,
  AuditCorrectiveActionResponse,
  AuditResponse,
  AuditsResponse,
  CreateAuditChecklistItemInput,
  CreateAuditFindingInput,
  CreateHseAuditInput,
  LinkAuditCorrectiveActionInput,
  UpdateAuditChecklistItemInput,
  UpdateHseAuditInput,
  UpdateHseAuditStatusInput,
} from "./types";

export const auditKeys = {
  all: ["audits"] as const,
  listRoot: ["audits", "list"] as const,
  list: (query: AuditFilterState) => [...auditKeys.listRoot, query] as const,
  detailRoot: ["audits", "detail"] as const,
  detail: (id: string) => [...auditKeys.detailRoot, id] as const,
  assignees: () => [...auditKeys.all, "assignees"] as const,
};

/** Builds the register query; empty filters are omitted. */
function buildListSearchParams(query: AuditFilterState): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.q) searchParams.set("q", query.q);
  if (query.status) searchParams.set("status", query.status);
  if (query.type) searchParams.set("type", query.type);
  if (query.siteId) searchParams.set("siteId", query.siteId);
  if (query.auditorId) searchParams.set("auditorId", query.auditorId);
  searchParams.set("page", String(query.page));
  searchParams.set("limit", String(query.limit));

  return searchParams;
}

/** Site-, auditor- and role-scoped audit register. */
export function useAudits(query: AuditFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: auditKeys.list(query),
    queryFn: () =>
      api.get<AuditsResponse>("/api/audits", buildListSearchParams(query)),
    placeholderData: keepPreviousData,
  });
}

export function useAudit(id: string) {
  const api = useApi();

  return useQuery({
    queryKey: auditKeys.detail(id),
    queryFn: () => api.get<AuditResponse>(`/api/audits/${id}`),
    enabled: id.length > 0,
  });
}

/** Active HSE personnel that may be assigned as auditors. */
export function useAuditAssignees() {
  const api = useApi();

  return useQuery({
    queryKey: auditKeys.assignees(),
    queryFn: () => api.get<AuditAssigneesResponse>("/api/audits/assignees"),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateAudits() {
  const queryClient = useQueryClient();

  return (options: { correctiveActions?: boolean } = {}) => {
    void queryClient.invalidateQueries({ queryKey: auditKeys.all });
    void queryClient.invalidateQueries({ queryKey: hseKeys.dashboardRoot });

    if (options.correctiveActions) {
      void queryClient.invalidateQueries({
        queryKey: correctiveActionKeys.all,
      });
    }
  };
}

export function useCreateAudit() {
  const api = useApi();
  const invalidate = useInvalidateAudits();

  return useMutation({
    mutationFn: (input: CreateHseAuditInput) =>
      api.post<AuditResponse>("/api/audits", input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAudit() {
  const api = useApi();
  const invalidate = useInvalidateAudits();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHseAuditInput }) =>
      api.patch<AuditResponse>(`/api/audits/${id}`, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAuditStatus() {
  const api = useApi();
  const invalidate = useInvalidateAudits();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateHseAuditStatusInput;
    }) => api.patch<AuditResponse>(`/api/audits/${id}/status`, input),
    onSuccess: () => invalidate(),
  });
}

export function useAddAuditChecklistItem() {
  const api = useApi();
  const invalidate = useInvalidateAudits();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: CreateAuditChecklistItemInput;
    }) => api.post<AuditResponse>(`/api/audits/${id}/checklist`, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateAuditChecklistItem() {
  const api = useApi();
  const invalidate = useInvalidateAudits();

  return useMutation({
    mutationFn: ({
      id,
      itemId,
      input,
    }: {
      id: string;
      itemId: string;
      input: UpdateAuditChecklistItemInput;
    }) =>
      api.patch<AuditResponse>(
        `/api/audits/${id}/checklist/${itemId}`,
        input,
      ),
    onSuccess: () => invalidate(),
  });
}

export function useAddAuditFinding() {
  const api = useApi();
  const invalidate = useInvalidateAudits();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: CreateAuditFindingInput;
    }) => api.post<AuditResponse>(`/api/audits/${id}/findings`, input),
    onSuccess: () => invalidate(),
  });
}

/**
 * Raises a corrective action from one finding. The API writes the CAPA, the
 * finding backlink and both audit rows atomically, so both caches are
 * invalidated on success.
 */
export function useLinkAuditCorrectiveAction() {
  const api = useApi();
  const invalidate = useInvalidateAudits();

  return useMutation({
    mutationFn: ({
      auditId,
      findingId,
      input,
    }: {
      auditId: string;
      findingId: string;
      input: LinkAuditCorrectiveActionInput;
    }) =>
      api.post<AuditCorrectiveActionResponse>(
        `/api/audits/${auditId}/findings/${findingId}/corrective-action`,
        input,
      ),
    onSuccess: () => invalidate({ correctiveActions: true }),
  });
}
