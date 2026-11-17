"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "./client";
import type {
  ContractorPersonnelListResponse,
  EmployeeDirectoryResponse,
} from "./types";

/**
 * Workforce pickers for training and toolbox talk participants.
 *
 * These reuse the existing employee directory and contractor personnel
 * endpoints. Contractor personnel are a separate population and are only
 * offered when they have an active assignment to the selected site.
 */

export const workforcePickerKeys = {
  all: ["workforce-picker"] as const,
  employees: (siteId: string) =>
    [...workforcePickerKeys.all, "employees", siteId] as const,
  contractorPersonnel: (siteId: string) =>
    [...workforcePickerKeys.all, "contractor-personnel", siteId] as const,
};

export function useParticipantEmployees(siteId = "") {
  const api = useApi();

  return useQuery({
    queryKey: workforcePickerKeys.employees(siteId),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set("page", "1");
      searchParams.set("limit", "100");
      searchParams.set("sort", "name");
      if (siteId) searchParams.set("siteId", siteId);
      return api.get<EmployeeDirectoryResponse>(
        "/api/employees",
        searchParams,
      );
    },
    enabled: siteId.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useParticipantContractorPersonnel(siteId = "") {
  const api = useApi();

  return useQuery({
    queryKey: workforcePickerKeys.contractorPersonnel(siteId),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set("page", "1");
      searchParams.set("limit", "100");
      if (siteId) searchParams.set("siteId", siteId);
      return api.get<ContractorPersonnelListResponse>(
        "/api/contractor-personnel",
        searchParams,
      );
    },
    enabled: siteId.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
