"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useApi } from "./client";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ManagementOfChangeStatus =
  | "DRAFT"
  | "ASSESSMENT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IMPLEMENTING"
  | "VERIFICATION"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED";

export type ManagementOfChangeType = "TEMPORARY" | "PERMANENT";

export interface ManagementOfChangeReference {
  id: string;
  name: string | null;
  code?: string | null;
}

export interface ManagementOfChangePerson {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface ManagementOfChangeRiskAssessmentRef {
  id: string;
  title: string;
  status: string;
  revision: number | null;
}

export interface ManagementOfChangeApproval {
  approvalType: "TECHNICAL" | "MANAGEMENT" | string;
  approver: ManagementOfChangePerson | null;
  authorityBasis: string;
  decision: "APPROVED" | "REJECTED" | string;
  comments: string;
  decidedAt: string | null;
}

export interface ManagementOfChangeSummary {
  id: string;
  reference: string;
  title: string;
  reason: string;
  scope: string;
  changeType: ManagementOfChangeType;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  affectedAssets: string[];
  affectedPeople: string[];
  project: ManagementOfChangeReference | null;
  site: ManagementOfChangeReference | null;
  changeOwner: ManagementOfChangePerson | null;
  status: ManagementOfChangeStatus;
  emergencyChange: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManagementOfChangeDetail extends ManagementOfChangeSummary {
  createdBy: ManagementOfChangePerson | null;
  submittedBy: ManagementOfChangePerson | null;
  submittedAt: string | null;
  impactAssessment: {
    qhseRisks: string;
    environmentalAspects: string;
    legalAndClientObligations: string;
    competenceRequirements: string;
    procedureChanges: string;
    emergencyArrangements: string;
    interfaces: string;
    riskAssessment: ManagementOfChangeRiskAssessmentRef | null;
  };
  implementationPlan: {
    controls: string;
    testingPlan: string;
    communicationPlan: string;
    rollbackPlan: string;
    updatedDocuments: string[];
    briefingCompleted: boolean;
    briefingAt: string | null;
  };
  approvals: ManagementOfChangeApproval[];
  verification: {
    findings: string;
    testingCompleted: boolean;
    inspectionCompleted: boolean;
    actionsClosed: boolean;
    verifiedBy: ManagementOfChangePerson | null;
    verifiedAt: string | null;
  };
  emergencyReviewAt: string | null;
  closedBy: ManagementOfChangePerson | null;
  closedAt: string | null;
}

export interface ManagementOfChangeApprovalPolicy {
  sop: "A03";
  sopStatus: "DRAFT";
  activationConfirmed: boolean;
  delegatedAuthorityEstablished: boolean;
  submissionAllowed: boolean;
  approvalAllowed: boolean;
  implementationAllowed: boolean;
  message: string;
}

export interface ManagementOfChangeListResponse {
  success: boolean;
  items: ManagementOfChangeSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  approvalPolicy?: ManagementOfChangeApprovalPolicy;
}

export interface ManagementOfChangeResponse {
  success: boolean;
  item: ManagementOfChangeDetail;
  approvalPolicy?: ManagementOfChangeApprovalPolicy;
}

export interface ManagementOfChangeHistoryEntry {
  id: string;
  actor: { id: string };
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface ManagementOfChangeHistoryResponse {
  success: boolean;
  data: {
    history: ManagementOfChangeHistoryEntry[];
  };
}

export interface ManagementOfChangeListQuery {
  page?: number;
  limit?: number;
  status?: ManagementOfChangeStatus | "";
  projectId?: string;
  siteId?: string;
  q?: string;
}

export interface CreateManagementOfChangeInput {
  title: string;
  reason: string;
  scope: string;
  changeType: ManagementOfChangeType;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  affectedAssets?: string[];
  affectedPeople?: string[];
  project: string;
  site?: string | null;
}

export interface ManagementOfChangeAssessmentInput {
  qhseRisks: string;
  environmentalAspects: string;
  legalAndClientObligations: string;
  competenceRequirements: string;
  procedureChanges: string;
  emergencyArrangements: string;
  interfaces: string;
  riskAssessment?: string | null;
}

export interface ManagementOfChangeApprovalInput {
  decision: "APPROVED" | "REJECTED";
  comments?: string;
}

/* -------------------------------------------------------------------------- */
/* Query keys and parameters                                                  */
/* -------------------------------------------------------------------------- */

export const managementOfChangeKeys = {
  all: ["management-of-change"] as const,
  lists: () => [...managementOfChangeKeys.all, "list"] as const,
  list: (query: ManagementOfChangeListQuery) =>
    [...managementOfChangeKeys.lists(), query] as const,
  details: () => [...managementOfChangeKeys.all, "detail"] as const,
  detail: (id: string) => [...managementOfChangeKeys.details(), id] as const,
  histories: () => [...managementOfChangeKeys.all, "history"] as const,
  history: (id: string) =>
    [...managementOfChangeKeys.histories(), id] as const,
};

export function buildManagementOfChangeSearchParams(
  query: ManagementOfChangeListQuery,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 20));

  if (query.status) params.set("status", query.status);
  if (query.projectId) params.set("projectId", query.projectId);
  if (query.siteId) params.set("siteId", query.siteId);

  const search = query.q?.trim();
  if (search) params.set("q", search);

  return params;
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export function useManagementOfChanges(
  query: ManagementOfChangeListQuery = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: managementOfChangeKeys.list(query),
    queryFn: () =>
      api.get<ManagementOfChangeListResponse>(
        "/api/management-of-change",
        buildManagementOfChangeSearchParams(query),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useManagementOfChange(
  id: string,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: managementOfChangeKeys.detail(id),
    queryFn: () =>
      api.get<ManagementOfChangeResponse>(`/api/management-of-change/${id}`),
    enabled: options.enabled !== false && Boolean(id),
  });
}

/** Record-level audit history, available to anyone who can read the record. */
export function useManagementOfChangeHistory(
  id: string,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: managementOfChangeKeys.history(id),
    queryFn: () =>
      api.get<ManagementOfChangeHistoryResponse>(
        `/api/management-of-change/${id}/history`,
      ),
    enabled: options.enabled !== false && Boolean(id),
  });
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

function useInvalidateManagementOfChange() {
  const queryClient = useQueryClient();

  return (id?: string) => {
    void queryClient.invalidateQueries({
      queryKey: managementOfChangeKeys.all,
    });

    if (id) {
      void queryClient.invalidateQueries({
        queryKey: managementOfChangeKeys.detail(id),
      });
      void queryClient.invalidateQueries({
        queryKey: managementOfChangeKeys.history(id),
      });
    }
  };
}

export function useCreateManagementOfChange() {
  const api = useApi();
  const invalidate = useInvalidateManagementOfChange();

  return useMutation({
    mutationFn: (input: CreateManagementOfChangeInput) =>
      api.post<ManagementOfChangeResponse>("/api/management-of-change", input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateManagementOfChangeAssessment() {
  const api = useApi();
  const invalidate = useInvalidateManagementOfChange();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: ManagementOfChangeAssessmentInput;
    }) =>
      api.patch<ManagementOfChangeResponse>(
        `/api/management-of-change/${id}/assessment`,
        input,
      ),
    onSuccess: (_response, variables) => invalidate(variables.id),
  });
}

export function useSubmitManagementOfChange() {
  const api = useApi();
  const invalidate = useInvalidateManagementOfChange();

  return useMutation({
    mutationFn: (id: string) =>
      api.post<ManagementOfChangeResponse>(
        `/api/management-of-change/${id}/submit`,
        {},
      ),
    onSuccess: (_response, id) => invalidate(id),
  });
}

export function useApproveManagementOfChangeTechnical() {
  const api = useApi();
  const invalidate = useInvalidateManagementOfChange();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: ManagementOfChangeApprovalInput;
    }) =>
      api.post<ManagementOfChangeResponse>(
        `/api/management-of-change/${id}/approvals/technical`,
        input,
      ),
    onSuccess: (_response, variables) => invalidate(variables.id),
  });
}

export function useApproveManagementOfChangeManagement() {
  const api = useApi();
  const invalidate = useInvalidateManagementOfChange();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: ManagementOfChangeApprovalInput;
    }) =>
      api.post<ManagementOfChangeResponse>(
        `/api/management-of-change/${id}/approvals/management`,
        input,
      ),
    onSuccess: (_response, variables) => invalidate(variables.id),
  });
}
