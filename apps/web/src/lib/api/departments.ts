"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useApi } from "./client";
import type {
  DepartmentSummary,
  DepartmentsResponse,
} from "./types";

export const departmentKeys = {
  all: ["departments"] as const,
  list: (includeInactive: boolean) =>
    [...departmentKeys.all, "list", includeInactive] as const,
};

export function useDepartments(includeInactive = false) {
  const api = useApi();

  return useQuery({
    queryKey: departmentKeys.list(includeInactive),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (includeInactive) {
        searchParams.set("includeInactive", "true");
      }
      return api.get<DepartmentsResponse>("/api/departments", searchParams);
    },
  });
}

export interface DepartmentInput {
  name: string;
  code: string;
  description?: string | null;
  headId?: string | null;
}

export function useCreateDepartment() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DepartmentInput) =>
      api.post<{ department: DepartmentSummary }>("/api/departments", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: departmentKeys.all });
    },
  });
}

export function useUpdateDepartment() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<DepartmentInput> & { isActive?: boolean };
    }) =>
      api.patch<{ department: DepartmentSummary }>(
        `/api/departments/${id}`,
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: departmentKeys.all });
    },
  });
}

export function useDeleteDepartment() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ message: string }>(`/api/departments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: departmentKeys.all });
    },
  });
}
