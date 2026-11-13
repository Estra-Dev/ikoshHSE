"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  buildPersonnelSearchParams,
  type PersonnelDirectoryFilters,
} from "@/lib/personnel";
import { useApi } from "./client";
import type { EmployeeDirectoryResponse } from "./types";

export {
  EMPTY_PERSONNEL_FILTERS,
  type PersonnelDirectoryFilters,
} from "@/lib/personnel";

export const personnelKeys = {
  all: ["personnel"] as const,
  directory: (filters: PersonnelDirectoryFilters) =>
    [...personnelKeys.all, "directory", filters] as const,
};

/**
 * Personnel directory for access management. The API returns role, active
 * status and assigned sites only to HSE managers and administrators.
 */
export function usePersonnelDirectory({
  filters,
  enabled = true,
}: {
  filters: PersonnelDirectoryFilters;
  enabled?: boolean;
}) {
  const api = useApi();

  return useQuery({
    queryKey: personnelKeys.directory(filters),
    queryFn: () =>
      api.get<EmployeeDirectoryResponse>(
        "/api/employees",
        buildPersonnelSearchParams(filters),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}
