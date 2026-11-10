"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useApi } from "./client";
import {
  buildDirectorySearchParams,
  type DirectoryFilterState,
} from "./directory-filters";
import type {
  EmployeeBasic,
  EmployeeDirectoryResponse,
  EmployeeFull,
  EmploymentType,
  IkoshRole,
} from "./types";

export const employeeKeys = {
  all: ["employees"] as const,
  directory: (filters: DirectoryFilterState) =>
    [...employeeKeys.all, "directory", filters] as const,
  detail: (id: string) => [...employeeKeys.all, "detail", id] as const,
  me: () => [...employeeKeys.all, "me"] as const,
};

interface EmployeeDirectoryFilters {
  filters: DirectoryFilterState;
}

export function useEmployeeDirectory({
  filters,
}: EmployeeDirectoryFilters) {
  const api = useApi();

  return useQuery({
    queryKey: employeeKeys.directory(filters),
    queryFn: () =>
      api.get<EmployeeDirectoryResponse>(
        "/api/employees",
        buildDirectorySearchParams(filters),
      ),
    placeholderData: keepPreviousData,
  });
}

/** The viewer's own full profile (also carries the IKOSH role). */
export function useMe() {
  const api = useApi();

  return useQuery({
    queryKey: employeeKeys.me(),
    queryFn: () => api.get<{ employee: EmployeeFull }>("/api/employees/me"),
  });
}

export function useEmployee(id: string | null) {
  const api = useApi();

  return useQuery({
    queryKey: employeeKeys.detail(id ?? "none"),
    queryFn: () =>
      api.get<{ employee: EmployeeBasic | EmployeeFull }>(
        `/api/employees/${id ?? ""}`,
      ),
    enabled: id !== null,
  });
}

export function useUpdateOwnProfile() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { phone?: string | null; location?: string | null }) =>
      api.patch<{ employee: EmployeeFull }>("/api/employees/me", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.me() });
    },
  });
}

export interface UpdateEmployeeInput {
  employeeId?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  employmentType?: EmploymentType | null;
  hireDate?: string | null;
  managerId?: string | null;
  phone?: string | null;
  location?: string | null;
}

export function useUpdateEmployee() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateEmployeeInput;
    }) => api.patch<{ employee: EmployeeFull }>(`/api/employees/${id}`, input),
    onSuccess: ({ employee }) => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.setQueryData(employeeKeys.detail(employee.id), {
        employee,
      });
    },
  });
}

export function useUpdateEmployeeRole() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ikoshRole }: { id: string; ikoshRole: IkoshRole }) =>
      api.patch<{ employee: EmployeeFull }>(`/api/employees/${id}/role`, {
        ikoshRole,
      }),
    onSuccess: ({ employee }) => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.setQueryData(employeeKeys.detail(employee.id), {
        employee,
      });
    },
  });
}

export function useUpdateEmployeeStatus() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch<{ employee: EmployeeFull }>(`/api/employees/${id}/status`, {
        isActive,
      }),
    onSuccess: ({ employee }) => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.setQueryData(employeeKeys.detail(employee.id), {
        employee,
      });
    },
  });
}
