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
  useRiskAssessmentAssignees,
  useRiskAssessments,
} from "@/lib/api/risk-assessments";
import { useSites } from "@/lib/api/worksites";
import {
  buildRiskAssessmentFilterSearchParams,
  hasActiveRiskAssessmentFilters,
  parseRiskAssessmentFilters,
  type RiskAssessmentFilterState,
} from "@/lib/risk-assessments";
import { canCreateRiskAssessments } from "@/lib/permissions";
import { RiskAssessmentFilters } from "./risk-assessment-filters";
import { RiskAssessmentRegisterTable } from "./risk-assessment-register-table";

/**
 * Risk assessment register. Filter state is mirrored into the URL so views are
 * shareable and survive refreshes. Scoping and authorization stay server-side.
 */
export function RiskAssessmentRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const sites = useSites();
  const assignees = useRiskAssessmentAssignees();

  const filters = useMemo(
    () =>
      parseRiskAssessmentFilters(
        new URLSearchParams(searchParams.toString()),
      ),
    [searchParams],
  );

  const assessments = useRiskAssessments(filters);

  const navigate = useCallback(
    (next: RiskAssessmentFilterState) => {
      const params = buildRiskAssessmentFilterSearchParams(next);
      const query = params.toString();
      router.replace(
        query ? `/risk-assessments?${query}` : "/risk-assessments",
      );
    },
    [router],
  );

  const handleChange = useCallback(
    (partial: Partial<RiskAssessmentFilterState>) => {
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
    router.replace("/risk-assessments");
  }, [router]);

  const items = assessments.data?.riskAssessments ?? [];
  const pagination = assessments.data?.pagination;
  const canCreate = canCreateRiskAssessments(me.data?.employee.ikoshRole);
  const filtersActive = hasActiveRiskAssessmentFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Risk assessments"
        description="Hazard assessments for projects and sites, from draft through HSE management approval. Visibility is scoped by site and ownership."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void assessments.refetch()}
              isLoading={assessments.isFetching}
            >
              <RefreshIcon size={16} />
              Refresh
            </Button>
            {canCreate && (
              <Link
                href="/risk-assessments/new"
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                New assessment
              </Link>
            )}
          </div>
        }
      />

      <RiskAssessmentFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        sites={sites.data?.sites ?? []}
        assignees={assignees.data?.assignees ?? []}
      />

      {assessments.isError && !assessments.data ? (
        <ErrorState
          title="Unable to load risk assessments"
          message={
            assessments.error instanceof Error
              ? assessments.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void assessments.refetch()}
              isLoading={assessments.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : assessments.isLoading ? (
        <Spinner label="Loading risk assessments..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? "No risk assessments match these filters"
              : "No risk assessments yet"
          }
          description={
            filtersActive
              ? "Adjust the search, site, status or owner filters to see more results."
              : "Risk assessments created by the HSE team will appear here."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Link
                href="/risk-assessments/new"
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                New assessment
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Assessments are ordered by last update, most recent first.
            </p>
            <Badge tone="neutral">
              {assessments.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} assessment${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <RiskAssessmentRegisterTable assessments={items} />

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
