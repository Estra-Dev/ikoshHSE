"use client";

import { useQuery } from "@tanstack/react-query";
import {
  buildAuditLogSearchParams,
  isValidObjectId,
  type AuditLogQueryState,
} from "@/lib/audit-log";
import { useApi } from "./client";
import type { AuditLogResponse } from "./types";

export const auditLogKeys = {
  all: ["audit-log"] as const,
  list: (query: AuditLogQueryState) =>
    [...auditLogKeys.all, query] as const,
};

/**
 * Read-only audit log query. The endpoint is restricted to HSE managers and
 * admins; other roles receive a 403 from the API.
 */
export function useAuditLog(
  query: AuditLogQueryState,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();
  const trimmedEntityId = query.entityId.trim();
  const entityIdValid =
    trimmedEntityId === "" || isValidObjectId(trimmedEntityId);

  return useQuery({
    queryKey: auditLogKeys.list(query),
    queryFn: () =>
      api.get<AuditLogResponse>(
        "/api/hse/audit-log",
        buildAuditLogSearchParams(query),
      ),
    enabled: (options.enabled ?? true) && entityIdValid,
  });
}
