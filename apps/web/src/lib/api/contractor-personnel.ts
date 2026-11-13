"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useApi } from "./client";
import {
  buildContractorPersonnelSearchParams,
  type ContractorPersonnelListQuery,
} from "@/lib/contractors";
import type {
  ContractorPersonnelAssignmentResponse,
  ContractorPersonnelDetailResponse,
  ContractorPersonnelInput,
  ContractorPersonnelListResponse,
  ContractorPersonnelResponse,
} from "./types";

export const contractorPersonnelKeys = {
  all: ["contractor-personnel"] as const,
  list: (query: ContractorPersonnelListQuery) =>
    [...contractorPersonnelKeys.all, "list", query] as const,
  detail: (id: string) =>
    [...contractorPersonnelKeys.all, "detail", id] as const,
};

export function useContractorPersonnelList(
  query: ContractorPersonnelListQuery,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: contractorPersonnelKeys.list(query),
    queryFn: () =>
      api.get<ContractorPersonnelListResponse>(
        "/api/contractor-personnel",
        buildContractorPersonnelSearchParams(query),
      ),
    placeholderData: keepPreviousData,
    enabled: options.enabled !== false,
  });
}

export function useContractorPersonnel(
  id: string,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: contractorPersonnelKeys.detail(id),
    queryFn: () =>
      api.get<ContractorPersonnelDetailResponse>(
        `/api/contractor-personnel/${id}`,
      ),
    enabled: options.enabled !== false && Boolean(id),
  });
}

function useInvalidateContractorPersonnel() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: contractorPersonnelKeys.all,
    });
    void queryClient.invalidateQueries({ queryKey: ["hse", "dashboard"] });
  };
}

export function useCreateContractorPersonnel() {
  const api = useApi();
  const invalidate = useInvalidateContractorPersonnel();

  return useMutation({
    mutationFn: (input: ContractorPersonnelInput) =>
      api.post<ContractorPersonnelResponse>(
        "/api/contractor-personnel",
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateContractorPersonnel() {
  const api = useApi();
  const invalidate = useInvalidateContractorPersonnel();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<ContractorPersonnelInput>;
    }) =>
      api.patch<ContractorPersonnelResponse>(
        `/api/contractor-personnel/${id}`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useAddContractorPersonnelAssignment() {
  const api = useApi();
  const invalidate = useInvalidateContractorPersonnel();

  return useMutation({
    mutationFn: ({
      personnelId,
      siteId,
    }: {
      personnelId: string;
      siteId: string;
    }) =>
      api.post<ContractorPersonnelAssignmentResponse>(
        `/api/contractor-personnel/${personnelId}/assignments`,
        { siteId },
      ),
    onSuccess: invalidate,
  });
}

export function useEndContractorPersonnelAssignment() {
  const api = useApi();
  const invalidate = useInvalidateContractorPersonnel();

  return useMutation({
    mutationFn: ({
      personnelId,
      assignmentId,
    }: {
      personnelId: string;
      assignmentId: string;
    }) =>
      api.delete<ContractorPersonnelAssignmentResponse>(
        `/api/contractor-personnel/${personnelId}/assignments/${assignmentId}`,
      ),
    onSuccess: invalidate,
  });
}
