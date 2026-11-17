"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  buildToolboxTalkFilterSearchParams,
  type ToolboxTalkFilterState,
} from "@/lib/toolbox-talks";
import { useApi } from "./client";
import type {
  CreateToolboxTalkInput,
  MyToolboxTalksResponse,
  PersonToolboxTalkHistoryResponse,
  ToolboxTalkParticipantInput,
  ToolboxTalkResponse,
  ToolboxTalksResponse,
  UpdateToolboxTalkInput,
  UpdateToolboxTalkStatusInput,
  WorkforceParticipantKind,
} from "./types";

export const toolboxTalkKeys = {
  all: ["toolbox-talks"] as const,
  listRoot: ["toolbox-talks", "list"] as const,
  list: (filters: ToolboxTalkFilterState) =>
    [...toolboxTalkKeys.listRoot, filters] as const,
  detailRoot: ["toolbox-talks", "detail"] as const,
  detail: (id: string) => [...toolboxTalkKeys.detailRoot, id] as const,
  myRoot: ["toolbox-talks", "my"] as const,
  my: () => [...toolboxTalkKeys.myRoot] as const,
  personHistoryRoot: ["toolbox-talks", "person-history"] as const,
  personHistory: (kind: WorkforceParticipantKind, personId: string) =>
    [...toolboxTalkKeys.personHistoryRoot, kind, personId] as const,
};

function buildListSearchParams(
  filters: ToolboxTalkFilterState,
): URLSearchParams {
  const searchParams = buildToolboxTalkFilterSearchParams(filters);
  searchParams.set("page", String(filters.page));
  searchParams.set("limit", String(filters.limit));
  return searchParams;
}

/** Site-scoped toolbox talk register. */
export function useToolboxTalks(filters: ToolboxTalkFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: toolboxTalkKeys.list(filters),
    queryFn: () =>
      api.get<ToolboxTalksResponse>(
        "/api/toolbox-talks",
        buildListSearchParams(filters),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useToolboxTalk(id: string) {
  const api = useApi();

  return useQuery({
    queryKey: toolboxTalkKeys.detail(id),
    queryFn: () => api.get<ToolboxTalkResponse>(`/api/toolbox-talks/${id}`),
    enabled: id.length > 0,
  });
}

/** The caller's own toolbox talk participation, without other attendees. */
export function useMyToolboxTalks() {
  const api = useApi();

  return useQuery({
    queryKey: toolboxTalkKeys.my(),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set("page", "1");
      searchParams.set("limit", "100");
      return api.get<MyToolboxTalksResponse>(
        "/api/toolbox-talks/my",
        searchParams,
      );
    },
  });
}

/** Staff-only toolbox talk history for one employee or contractor person. */
export function usePersonToolboxTalkHistory(
  kind: WorkforceParticipantKind,
  personId: string,
) {
  const api = useApi();
  const pathKind = kind === "EMPLOYEE" ? "employee" : "contractor";

  return useQuery({
    queryKey: toolboxTalkKeys.personHistory(kind, personId),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set("page", "1");
      searchParams.set("limit", "100");
      return api.get<PersonToolboxTalkHistoryResponse>(
        `/api/toolbox-talks/personnel/${pathKind}/${personId}/history`,
        searchParams,
      );
    },
    enabled: personId.length > 0,
  });
}

function useInvalidateToolboxTalks() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: toolboxTalkKeys.all });
  };
}

export function useCreateToolboxTalk() {
  const api = useApi();
  const invalidate = useInvalidateToolboxTalks();

  return useMutation({
    mutationFn: (input: CreateToolboxTalkInput) =>
      api.post<ToolboxTalkResponse>("/api/toolbox-talks", input),
    onSuccess: invalidate,
  });
}

export function useUpdateToolboxTalk() {
  const api = useApi();
  const invalidate = useInvalidateToolboxTalks();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateToolboxTalkInput;
    }) => api.patch<ToolboxTalkResponse>(`/api/toolbox-talks/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateToolboxTalkParticipants() {
  const api = useApi();
  const invalidate = useInvalidateToolboxTalks();

  return useMutation({
    mutationFn: ({
      id,
      participants,
    }: {
      id: string;
      participants: ToolboxTalkParticipantInput[];
    }) =>
      api.put<ToolboxTalkResponse>(`/api/toolbox-talks/${id}/participants`, {
        participants,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateToolboxTalkStatus() {
  const api = useApi();
  const invalidate = useInvalidateToolboxTalks();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateToolboxTalkStatusInput;
    }) => api.patch<ToolboxTalkResponse>(`/api/toolbox-talks/${id}/status`, input),
    onSuccess: invalidate,
  });
}
