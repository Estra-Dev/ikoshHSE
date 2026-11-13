"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { buildAttachmentSearchParams } from "@/lib/attachments";
import { useApi } from "./client";
import { hseKeys } from "./hse";
import type { AttachmentResponse, AttachmentsResponse } from "./types";

export const attachmentKeys = {
  all: ["attachments"] as const,
  listRoot: ["attachments", "list"] as const,
  list: (incidentId: string, page: number) =>
    [...attachmentKeys.listRoot, incidentId, page] as const,
  blobRoot: ["attachments", "blob"] as const,
  blob: (attachmentId: string) =>
    [...attachmentKeys.blobRoot, attachmentId] as const,
  textRoot: ["attachments", "text"] as const,
  text: (attachmentId: string) =>
    [...attachmentKeys.textRoot, attachmentId] as const,
};

/** Evidence attached to one incident, newest first (bounded to 100 items). */
export function useIncidentAttachments(incidentId: string, page = 1) {
  const api = useApi();

  return useQuery({
    queryKey: attachmentKeys.list(incidentId, page),
    queryFn: () =>
      api.get<AttachmentsResponse>(
        "/api/attachments",
        buildAttachmentSearchParams({ incidentId, page, limit: 100 }),
      ),
    enabled: incidentId.length > 0,
  });
}

export interface UploadAttachmentInput {
  incidentId: string;
  file: File;
  description?: string;
}

/**
 * Uploads one file at a time. `entityType` and `entityId` are always supplied
 * together, and the browser sets the multipart boundary automatically.
 */
export function useUploadIncidentAttachment() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ incidentId, file, description }: UploadAttachmentInput) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "incident");
      formData.append("entityId", incidentId);

      const trimmedDescription = description?.trim();

      if (trimmedDescription) {
        formData.append("description", trimmedDescription);
      }

      return api.postForm<AttachmentResponse>("/api/attachments", formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentKeys.all });
      void queryClient.invalidateQueries({ queryKey: hseKeys.dashboardRoot });
    },
  });
}

/**
 * Authenticated attachment bytes. The download endpoint is protected, so the
 * result must be rendered from an object URL rather than used as a direct
 * `<img src>`.
 */
export function useAttachmentBlob(attachmentId: string, enabled: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: attachmentKeys.blob(attachmentId),
    queryFn: () =>
      api.getBlob(`/api/attachments/${attachmentId}/download`),
    enabled,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
}

/** Authenticated plain-text preview, decoded without retaining the blob. */
export function useAttachmentText(attachmentId: string, enabled: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: attachmentKeys.text(attachmentId),
    queryFn: async () => {
      const blob = await api.getBlob(
        `/api/attachments/${attachmentId}/download`,
      );
      return blob.text();
    },
    enabled,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
}
