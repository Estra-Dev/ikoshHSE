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
import {
  useInspectionAssignees,
  useInspections,
} from "@/lib/api/inspections";
import { useSites } from "@/lib/api/worksites";
import {
  buildInspectionFilterSearchParams,
  hasActiveInspectionFilters,
  parseInspectionFilters,
  type InspectionFilterState,
} from "@/lib/inspections";
import { canCreateInspections } from "@/lib/permissions";
import { InspectionFilters } from "./inspection-filters";
import { InspectionRegisterTable } from "./inspection-register-table";

/**
 * Inspection register. Filter state is mirrored into the URL so views are
 * shareable and survive refreshes. All scoping and authorization is enforced
 * by the API.
 */
export function InspectionRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const sites = useSites();
  const assignees = useInspectionAssignees();

  const filters = useMemo(
    () => parseInspectionFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const inspections = useInspections(filters);

  const navigate = useCallback(
    (next: InspectionFilterState) => {
      const params = buildInspectionFilterSearchParams(next);
      const query = params.toString();
      router.replace(query ? `/inspections?${query}` : "/inspections");
    },
    [router],
  );

  const handleChange = useCallback(
    (partial: Partial<InspectionFilterState>) => {
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
    router.replace("/inspections");
  }, [router]);

  const items = inspections.data?.inspections ?? [];
  const pagination = inspections.data?.pagination;
  const canCreate = canCreateInspections(me.data?.employee.ikoshRole);
  const filtersActive = hasActiveInspectionFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Inspections"
        description="Scheduled HSE inspections, recorded findings and their follow-up actions. Visibility is scoped by site and inspector assignment."
        actions={
          canCreate ? (
            <Link
              href="/inspections/new"
              className={buttonStyles("primary")}
            >
              <PlusIcon size={16} />
              Schedule inspection
            </Link>
          ) : undefined
        }
      />

      <InspectionFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        sites={sites.data?.sites ?? []}
        assignees={assignees.data?.assignees ?? []}
      />

      {inspections.isError && !inspections.data ? (
        <ErrorState
          title="Unable to load inspections"
          message={
            inspections.error instanceof Error
              ? inspections.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void inspections.refetch()}
              isLoading={inspections.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : inspections.isLoading ? (
        <Spinner label="Loading inspections..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? "No inspections match these filters"
              : "No inspections scheduled yet"
          }
          description={
            filtersActive
              ? "Adjust the search, site, status, type or inspector filters to see more results."
              : "Scheduled inspections will appear here once the HSE team creates them."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Link
                href="/inspections/new"
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                Schedule inspection
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Inspections are ordered by scheduled date, most recent first.
            </p>
            <Badge tone="neutral">
              {inspections.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} inspection${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <InspectionRegisterTable inspections={items} />

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
