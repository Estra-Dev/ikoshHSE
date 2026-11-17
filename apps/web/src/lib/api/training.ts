"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  buildTrainingFilterSearchParams,
  type TrainingFilterState,
} from "@/lib/training";
import { useApi } from "./client";
import type {
  CreateTrainingCourseInput,
  CreateTrainingSessionInput,
  MyTrainingSessionsResponse,
  PersonTrainingHistoryResponse,
  TrainingCourseResponse,
  TrainingCoursesResponse,
  TrainingSessionResponse,
  TrainingSessionsResponse,
  TrainingParticipantInput,
  UpdateTrainingCourseInput,
  UpdateTrainingSessionInput,
  UpdateTrainingSessionStatusInput,
  WorkforceParticipantKind,
} from "./types";

export const trainingKeys = {
  all: ["training"] as const,
  coursesRoot: ["training", "courses"] as const,
  courses: (query: { q: string; includeInactive: boolean }) =>
    [...trainingKeys.coursesRoot, query] as const,
  listRoot: ["training", "list"] as const,
  list: (filters: TrainingFilterState) =>
    [...trainingKeys.listRoot, filters] as const,
  detailRoot: ["training", "detail"] as const,
  detail: (id: string) => [...trainingKeys.detailRoot, id] as const,
  myRoot: ["training", "my"] as const,
  my: () => [...trainingKeys.myRoot] as const,
  personHistoryRoot: ["training", "person-history"] as const,
  personHistory: (kind: WorkforceParticipantKind, personId: string) =>
    [...trainingKeys.personHistoryRoot, kind, personId] as const,
};

function buildListSearchParams(filters: TrainingFilterState): URLSearchParams {
  const searchParams = buildTrainingFilterSearchParams(filters);
  searchParams.set("page", String(filters.page));
  searchParams.set("limit", String(filters.limit));
  return searchParams;
}

/** Active (or, for managers, inactive) training course catalogue. */
export function useTrainingCourses({
  q = "",
  includeInactive = false,
}: {
  q?: string;
  includeInactive?: boolean;
} = {}) {
  const api = useApi();

  return useQuery({
    queryKey: trainingKeys.courses({ q, includeInactive }),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (q) searchParams.set("q", q);
      if (includeInactive) searchParams.set("includeInactive", "true");
      return api.get<TrainingCoursesResponse>(
        "/api/training/courses",
        searchParams,
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Site-scoped training register. */
export function useTrainingSessions(filters: TrainingFilterState) {
  const api = useApi();

  return useQuery({
    queryKey: trainingKeys.list(filters),
    queryFn: () =>
      api.get<TrainingSessionsResponse>(
        "/api/training",
        buildListSearchParams(filters),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useTrainingSession(id: string) {
  const api = useApi();

  return useQuery({
    queryKey: trainingKeys.detail(id),
    queryFn: () => api.get<TrainingSessionResponse>(`/api/training/${id}`),
    enabled: id.length > 0,
  });
}

/** The caller's own training participation, without other attendees. */
export function useMyTrainingSessions() {
  const api = useApi();

  return useQuery({
    queryKey: trainingKeys.my(),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set("page", "1");
      searchParams.set("limit", "100");
      return api.get<MyTrainingSessionsResponse>(
        "/api/training/my",
        searchParams,
      );
    },
  });
}

/** Staff-only training history for one employee or contractor person. */
export function usePersonTrainingHistory(
  kind: WorkforceParticipantKind,
  personId: string,
) {
  const api = useApi();
  const pathKind = kind === "EMPLOYEE" ? "employee" : "contractor";

  return useQuery({
    queryKey: trainingKeys.personHistory(kind, personId),
    queryFn: () => {
      const searchParams = new URLSearchParams();
      searchParams.set("page", "1");
      searchParams.set("limit", "100");
      return api.get<PersonTrainingHistoryResponse>(
        `/api/training/personnel/${pathKind}/${personId}/history`,
        searchParams,
      );
    },
    enabled: personId.length > 0,
  });
}

function useInvalidateTraining() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: trainingKeys.all });
  };
}

export function useCreateTrainingCourse() {
  const api = useApi();
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (input: CreateTrainingCourseInput) =>
      api.post<TrainingCourseResponse>("/api/training/courses", input),
    onSuccess: invalidate,
  });
}

export function useUpdateTrainingCourse() {
  const api = useApi();
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateTrainingCourseInput;
    }) => api.patch<TrainingCourseResponse>(`/api/training/courses/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useCreateTrainingSession() {
  const api = useApi();
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: (input: CreateTrainingSessionInput) =>
      api.post<TrainingSessionResponse>("/api/training", input),
    onSuccess: invalidate,
  });
}

export function useUpdateTrainingSession() {
  const api = useApi();
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateTrainingSessionInput;
    }) => api.patch<TrainingSessionResponse>(`/api/training/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateTrainingParticipants() {
  const api = useApi();
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: ({
      id,
      participants,
    }: {
      id: string;
      participants: TrainingParticipantInput[];
    }) =>
      api.put<TrainingSessionResponse>(`/api/training/${id}/participants`, {
        participants,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateTrainingSessionStatus() {
  const api = useApi();
  const invalidate = useInvalidateTraining();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateTrainingSessionStatusInput;
    }) => api.patch<TrainingSessionResponse>(`/api/training/${id}/status`, input),
    onSuccess: invalidate,
  });
}
