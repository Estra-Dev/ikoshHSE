"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  buildReportFilterSearchParams,
  type ReportFilterState,
} from "@/lib/reports";
import { useApi } from "./client";
import type { HseReportResponse } from "./types";

export const reportKeys = {
  all: ["hse", "reports"] as const,
  report: (filters: ReportFilterState) =>
    [...reportKeys.all, filters] as const,
};

/** Cross-module HSE report, scoped server-side to the viewer's sites. */
export function useHseReport(
  filters: ReportFilterState,
  options: { enabled?: boolean } = {},
) {
  const api = useApi();

  return useQuery({
    queryKey: reportKeys.report(filters),
    queryFn: () =>
      api.get<HseReportResponse>(
        "/api/hse/reports",
        buildReportFilterSearchParams(filters),
      ),
    placeholderData: keepPreviousData,
    enabled: options.enabled !== false,
  });
}
