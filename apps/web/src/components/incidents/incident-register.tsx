"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  buttonStyles,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { PlusIcon, RefreshIcon } from "@/components/icons";
import { useMe } from "@/lib/api/employees";
import { useIncidents } from "@/lib/api/incidents";
import { useSites } from "@/lib/api/worksites";
import type { IncidentType } from "@/lib/api/types";
import {
  buildIncidentFilterSearchParams,
  hasActiveIncidentFilters,
  parseIncidentFilters,
  type IncidentFilterState,
} from "@/lib/incident-filters";
import { incidentReportHref } from "@/lib/incident-workflow";
import { canReportIncidents } from "@/lib/permissions";
import { IncidentFilters } from "./incident-filters";
import { IncidentRegisterTable } from "./incident-register-table";

export type IncidentRegisterMode = "incidents" | "near-misses";

const MODE_CONFIG: Record<
  IncidentRegisterMode,
  {
    basePath: string;
    lockedType?: IncidentType;
    title: string;
    description: string;
    reportLabel: string;
    reportType: IncidentType;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  incidents: {
    basePath: "/incidents",
    title: "Incident register",
    description:
      "Every incident and near-miss report at the sites in your scope, newest first.",
    reportLabel: "Report incident",
    reportType: "INCIDENT",
    emptyTitle: "No reports yet",
    emptyDescription:
      "No incident or near-miss reports have been filed in your site scope.",
  },
  "near-misses": {
    basePath: "/near-misses",
    lockedType: "NEAR_MISS",
    title: "Near-miss register",
    description:
      "Near-miss reports at the sites in your scope, newest first. This register is locked to the near-miss type.",
    reportLabel: "Report near miss",
    reportType: "NEAR_MISS",
    emptyTitle: "No near misses recorded yet",
    emptyDescription:
      "Near misses reported at your accessible sites will appear here.",
  },
};

/**
 * Shared incident/near-miss register. Filter state is mirrored into the URL so
 * views are shareable and survive refreshes. All scoping and authorization is
 * enforced by the API.
 */
export function IncidentRegister({ mode }: { mode: IncidentRegisterMode }) {
  const config = MODE_CONFIG[mode];
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const sites = useSites();

  const filters = useMemo(
    () =>
      parseIncidentFilters(new URLSearchParams(searchParams.toString()), {
        lockedType: config.lockedType,
      }),
    [searchParams, config.lockedType],
  );

  const incidents = useIncidents({
    siteId: filters.siteId,
    status: filters.status,
    type: config.lockedType ?? filters.type,
    page: filters.page,
    limit: filters.limit,
  });

  const navigate = useCallback(
    (next: IncidentFilterState) => {
      const params = buildIncidentFilterSearchParams(next, {
        lockedType: config.lockedType,
      });
      const query = params.toString();
      router.replace(query ? `${config.basePath}?${query}` : config.basePath);
    },
    [config.basePath, config.lockedType, router],
  );

  const handleChange = useCallback(
    (partial: Partial<IncidentFilterState>) => {
      navigate({
        ...filters,
        ...partial,
        // Any filter change returns to the first page.
        page: partial.page ?? 1,
      });
    },
    [filters, navigate],
  );

  const handleReset = useCallback(() => {
    router.replace(config.basePath);
  }, [config.basePath, router]);

  const items = incidents.data?.incidents ?? [];
  const pagination = incidents.data?.pagination;
  const siteNames = new Map(sites.data?.sites.map((site) => [site.id, site.name]));
  const canReport = canReportIncidents(me.data?.employee.ikoshRole);
  const filtersActive = hasActiveIncidentFilters(filters, {
    lockedType: config.lockedType,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title={config.title}
        description={config.description}
        actions={
          canReport ? (
            <div className="flex flex-wrap gap-2">
              {mode === "incidents" && (
                <Link
                  href="/near-misses/new"
                  className={buttonStyles("secondary")}
                >
                  Report near miss
                </Link>
              )}
              <Link
                href={incidentReportHref(config.reportType)}
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                {config.reportLabel}
              </Link>
            </div>
          ) : undefined
        }
      />

      <IncidentFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        sites={sites.data?.sites ?? []}
        lockedType={config.lockedType}
      />

      {incidents.isError && !incidents.data ? (
        <ErrorState
          title="Unable to load the register"
          message={
            incidents.error instanceof Error
              ? incidents.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void incidents.refetch()}
              isLoading={incidents.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : incidents.isLoading ? (
        <Spinner label="Loading reports..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={filtersActive ? "No reports match these filters" : config.emptyTitle}
          description={
            filtersActive
              ? "Adjust the site, status or report type filters to see more results."
              : config.emptyDescription
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canReport ? (
              <Link
                href={incidentReportHref(config.reportType)}
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                {config.reportLabel}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Reports are ordered by occurrence time, newest first.
            </p>
            <Badge tone="neutral">
              {incidents.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} report${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <IncidentRegisterTable incidents={items} siteNames={siteNames} />

          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={(page) => handleChange({ page })}
            />
          )}
        </div>
      )}
    </div>
  );
}
