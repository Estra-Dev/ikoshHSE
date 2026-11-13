"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./client";
import {
  buildContractorDirectorySearchParams,
  CONTRACTOR_DIRECTORY_PAGE_SIZE,
} from "@/lib/contractors";
import type {
  ContractorInput,
  ContractorResponse,
  ContractorSummary,
  ContractorsResponse,
} from "./types";

/**
 * The API exposes a paginated contractor register but no search or detail
 * endpoint. The directory query therefore loads a bounded number of pages and
 * the register filters client-side; detail screens resolve from the same
 * cache.
 */
const MAX_DIRECTORY_PAGES = 10;

export const contractorKeys = {
  all: ["contractors"] as const,
  directory: () => [...contractorKeys.all, "directory"] as const,
};

export interface ContractorDirectory {
  contractors: ContractorSummary[];
  total: number;
  truncated: boolean;
}

type ApiClient = ReturnType<typeof useApi>;

async function fetchContractorDirectory(
  api: ApiClient,
): Promise<ContractorDirectory> {
  const first = await api.get<ContractorsResponse>(
    "/api/contractors",
    buildContractorDirectorySearchParams({ page: 1 }),
  );

  const pageCount = Math.min(
    first.pagination.totalPages,
    MAX_DIRECTORY_PAGES,
  );

  if (pageCount <= 1) {
    return {
      contractors: first.contractors,
      total: first.pagination.total,
      truncated: first.pagination.totalPages > MAX_DIRECTORY_PAGES,
    };
  }

  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      api.get<ContractorsResponse>(
        "/api/contractors",
        buildContractorDirectorySearchParams({
          page: index + 2,
          limit: CONTRACTOR_DIRECTORY_PAGE_SIZE,
        }),
      ),
    ),
  );

  return {
    contractors: [first, ...remaining].flatMap(
      (response) => response.contractors,
    ),
    total: first.pagination.total,
    truncated: first.pagination.totalPages > MAX_DIRECTORY_PAGES,
  };
}

export function useContractorDirectory(
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: contractorKeys.directory(),
    queryFn: () => fetchContractorDirectory(api),
    enabled: options.enabled !== false,
  });
}

/** Resolves a contractor from the shared directory cache. */
export function useContractor(
  id: string,
  options: { enabled?: boolean } = {},
) {
  const directory = useContractorDirectory(options);

  return {
    ...directory,
    contractor:
      directory.data?.contractors.find((contractor) => contractor.id === id) ??
      null,
  };
}

function useInvalidateContractors() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: contractorKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["hse", "dashboard"] });
  };
}

export function useCreateContractor() {
  const api = useApi();
  const invalidate = useInvalidateContractors();

  return useMutation({
    mutationFn: (input: ContractorInput) =>
      api.post<ContractorResponse>("/api/contractors", input),
    onSuccess: invalidate,
  });
}

export function useUpdateContractor() {
  const api = useApi();
  const invalidate = useInvalidateContractors();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<ContractorInput>;
    }) => api.patch<ContractorResponse>(`/api/contractors/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteContractor() {
  const api = useApi();
  const invalidate = useInvalidateContractors();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ success: boolean; message: string }>(
        `/api/contractors/${id}`,
      ),
    onSuccess: invalidate,
  });
}
