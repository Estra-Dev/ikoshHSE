"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { buildPpeSearchParams, type PpeFilterState } from "@/lib/ppe";
import { useApi } from "./client";
import type {
  CreatePpeItemInput,
  CreatePpeStockInput,
  IssuePpeInput,
  LostPpeInput,
  PpeIssuanceResponse,
  PpeIssuancesResponse,
  PpeItemResponse,
  PpeItemsResponse,
  PpePersonHistoryResponse,
  PpeStockListResponse,
  PpeStockResponse,
  ReplacePpeInput,
  ReturnPpeInput,
  UpdatePpeItemInput,
  UpdatePpeStockInput,
  WorkforceParticipantKind,
} from "./types";

export const ppeKeys = {
  all: ["ppe"] as const,
  itemsRoot: ["ppe", "items"] as const,
  items: (query: { q: string; includeInactive: boolean }) =>
    [...ppeKeys.itemsRoot, query] as const,
  stockRoot: ["ppe", "stock"] as const,
  stock: (query: {
    q: string;
    projectId: string;
    siteId: string;
    lowStockOnly: boolean;
    page: number;
    limit: number;
  }) => [...ppeKeys.stockRoot, query] as const,
  issuancesRoot: ["ppe", "issuances"] as const,
  issuances: (filters: PpeFilterState) =>
    [...ppeKeys.issuancesRoot, filters] as const,
  personHistoryRoot: ["ppe", "person-history"] as const,
  personHistory: (kind: WorkforceParticipantKind, personId: string) =>
    [...ppeKeys.personHistoryRoot, kind, personId] as const,
};

/** PPE catalogue. Inactive items are only returned to catalogue managers. */
export function usePpeItems(query: {
  q?: string;
  includeInactive?: boolean;
} = {}) {
  const api = useApi();
  const resolved = {
    q: query.q ?? "",
    includeInactive: query.includeInactive ?? false,
  };

  return useQuery({
    queryKey: ppeKeys.items(resolved),
    queryFn: () => {
      const params = new URLSearchParams();
      if (resolved.q) params.set("q", resolved.q);
      if (resolved.includeInactive) params.set("includeInactive", "true");
      return api.get<PpeItemsResponse>("/api/ppe/items", params);
    },
  });
}

/** Per-site stock with low/out-of-stock summary counts. */
export function usePpeStock(query: {
  q?: string;
  projectId?: string;
  siteId?: string;
  lowStockOnly?: boolean;
  page?: number;
  limit?: number;
} = {}) {
  const api = useApi();
  const resolved = {
    q: query.q ?? "",
    projectId: query.projectId ?? "",
    siteId: query.siteId ?? "",
    lowStockOnly: query.lowStockOnly ?? false,
    page: query.page ?? 1,
    limit: query.limit ?? 50,
  };

  return useQuery({
    queryKey: ppeKeys.stock(resolved),
    queryFn: () => {
      const params = new URLSearchParams();
      if (resolved.q) params.set("q", resolved.q);
      if (resolved.projectId) params.set("projectId", resolved.projectId);
      if (resolved.siteId) params.set("siteId", resolved.siteId);
      if (resolved.lowStockOnly) params.set("lowStockOnly", "true");
      params.set("page", String(resolved.page));
      params.set("limit", String(resolved.limit));
      return api.get<PpeStockListResponse>("/api/ppe/stock", params);
    },
    placeholderData: keepPreviousData,
  });
}

/** Site-scoped PPE issuance register. */
export function usePpeIssuances(filters: PpeFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: ppeKeys.issuances(filters),
    queryFn: () =>
      api.get<PpeIssuancesResponse>(
        "/api/ppe/issuances",
        buildPpeSearchParams(filters),
      ),
    placeholderData: keepPreviousData,
  });
}

/** PPE history for one employee or contractor person, scoped by record site. */
export function usePersonPpeHistory(
  kind: WorkforceParticipantKind,
  personId: string,
) {
  const api = useApi();
  const pathKind = kind === "EMPLOYEE" ? "employee" : "contractor";

  return useQuery({
    queryKey: ppeKeys.personHistory(kind, personId),
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100");
      return api.get<PpePersonHistoryResponse>(
        `/api/ppe/personnel/${pathKind}/${personId}/history`,
        params,
      );
    },
    enabled: personId.length > 0,
  });
}

function useInvalidatePpe() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: ppeKeys.all });
  };
}

export function useCreatePpeItem() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: (input: CreatePpeItemInput) =>
      api.post<PpeItemResponse>("/api/ppe/items", input),
    onSuccess: invalidate,
  });
}

export function useUpdatePpeItem() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdatePpeItemInput;
    }) => api.patch<PpeItemResponse>(`/api/ppe/items/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useCreatePpeStock() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: (input: CreatePpeStockInput) =>
      api.post<PpeStockResponse>("/api/ppe/stock", input),
    onSuccess: invalidate,
  });
}

export function useUpdatePpeStock() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdatePpeStockInput;
    }) => api.patch<PpeStockResponse>(`/api/ppe/stock/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useIssuePpe() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: (input: IssuePpeInput) =>
      api.post<PpeIssuanceResponse>("/api/ppe/issuances", input),
    onSuccess: invalidate,
  });
}

export function useReturnPpe() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReturnPpeInput }) =>
      api.patch<PpeIssuanceResponse>(`/api/ppe/issuances/${id}/return`, input),
    onSuccess: invalidate,
  });
}

export function useReplacePpe() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReplacePpeInput }) =>
      api.post<PpeIssuanceResponse>(`/api/ppe/issuances/${id}/replace`, input),
    onSuccess: invalidate,
  });
}

export function useMarkPpeLost() {
  const api = useApi();
  const invalidate = useInvalidatePpe();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LostPpeInput }) =>
      api.patch<PpeIssuanceResponse>(`/api/ppe/issuances/${id}/lost`, input),
    onSuccess: invalidate,
  });
}
