"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { RiskAssessmentFilterState } from "@/lib/risk-assessments";
import { useApi } from "./client";
import type {
  CreateRiskAssessmentInput,
  RiskAssessmentAssigneesResponse,
  RiskAssessmentResponse,
  RiskAssessmentsResponse,
  UpdateRiskAssessmentInput,
  UpdateRiskAssessmentStatusInput,
} from "./types";

export const riskAssessmentKeys = {
  all: ["risk-assessments"] as const,
  listRoot: ["risk-assessments", "list"] as const,
  list: (query: RiskAssessmentFilterState) =>
    [...riskAssessmentKeys.listRoot, query] as const,
  detailRoot: ["risk-assessments", "detail"] as const,
  detail: (id: string) => [...riskAssessmentKeys.detailRoot, id] as const,
  assignees: () => [...riskAssessmentKeys.all, "assignees"] as const,
};

/** Builds the register query; empty filters are omitted. */
function buildListSearchParams(
  query: RiskAssessmentFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.q) searchParams.set("q", query.q);
  if (query.status) searchParams.set("status", query.status);
  if (query.siteId) searchParams.set("siteId", query.siteId);
  if (query.ownerId) searchParams.set("ownerId", query.ownerId);
  searchParams.set("page", String(query.page));
  searchParams.set("limit", String(query.limit));

  return searchParams;
}

/** Site- and role-scoped risk assessment register. */
export function useRiskAssessments(query: RiskAssessmentFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: riskAssessmentKeys.list(query),
    queryFn: () =>
      api.get<RiskAssessmentsResponse>(
        "/api/risk-assessments",
        buildListSearchParams(query),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRiskAssessment(id: string) {
  const api = useApi();

  return useQuery({
    queryKey: riskAssessmentKeys.detail(id),
    queryFn: () =>
      api.get<RiskAssessmentResponse>(`/api/risk-assessments/${id}`),
    enabled: id.length > 0,
  });
}

/** Active HSE personnel that may own a risk assessment. */
export function useRiskAssessmentAssignees() {
  const api = useApi();

  return useQuery({
    queryKey: riskAssessmentKeys.assignees(),
    queryFn: () =>
      api.get<RiskAssessmentAssigneesResponse>(
        "/api/risk-assessments/assignees",
      ),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateRiskAssessments() {
  const queryClient = useQueryClient();

  return () =>
    void queryClient.invalidateQueries({ queryKey: riskAssessmentKeys.all });
}

export function useCreateRiskAssessment() {
  const api = useApi();
  const invalidate = useInvalidateRiskAssessments();

  return useMutation({
    mutationFn: (input: CreateRiskAssessmentInput) =>
      api.post<RiskAssessmentResponse>("/api/risk-assessments", input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRiskAssessment() {
  const api = useApi();
  const invalidate = useInvalidateRiskAssessments();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRiskAssessmentInput;
    }) =>
      api.patch<RiskAssessmentResponse>(
        `/api/risk-assessments/${id}`,
        input,
      ),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateRiskAssessmentStatus() {
  const api = useApi();
  const invalidate = useInvalidateRiskAssessments();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateRiskAssessmentStatusInput;
    }) =>
      api.patch<RiskAssessmentResponse>(
        `/api/risk-assessments/${id}/status`,
        input,
      ),
    onSuccess: () => invalidate(),
  });
}
