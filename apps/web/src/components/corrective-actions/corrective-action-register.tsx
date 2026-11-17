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
import { useCorrectiveActions } from "@/lib/api/corrective-actions";
import { useSites } from "@/lib/api/worksites";
import {
  buildCorrectiveActionFilterSearchParams,
  hasActiveCorrectiveActionFilters,
  parseCorrectiveActionFilters,
  type CorrectiveActionFilterState,
} from "@/lib/corrective-actions";
import { canCreateCorrectiveActions } from "@/lib/permissions";
import { CorrectiveActionFilters } from "./corrective-action-filters";
import { CorrectiveActionRegisterTable } from "./corrective-action-register-table";

/**
 * Corrective action register. Filter state is mirrored into the URL so views
 * are shareable and survive refreshes. All scoping and authorization is
 * enforced by the API.
 */
export function CorrectiveActionRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const sites = useSites();

  const filters = useMemo(
    () =>
      parseCorrectiveActionFilters(
        new URLSearchParams(searchParams.toString()),
      ),
    [searchParams],
  );

  const actions = useCorrectiveActions(filters);

  const navigate = useCallback(
    (next: CorrectiveActionFilterState) => {
      const params = buildCorrectiveActionFilterSearchParams(next);
      const query = params.toString();
      router.replace(
        query ? `/corrective-actions?${query}` : "/corrective-actions",
      );
    },
    [router],
  );

  const handleChange = useCallback(
    (partial: Partial<CorrectiveActionFilterState>) => {
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
    router.replace("/corrective-actions");
  }, [router]);

  const items = actions.data?.correctiveActions ?? [];
  const pagination = actions.data?.pagination;
  const canCreate = canCreateCorrectiveActions(me.data?.employee.ikoshRole);
  const filtersActive = hasActiveCorrectiveActionFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Corrective actions"
        description="Actions assigned to close out incidents, near misses and HSE observations. Visibility is scoped by site and assignment."
        actions={
          canCreate ? (
            <Link
              href="/corrective-actions/new"
              className={buttonStyles("primary")}
            >
              <PlusIcon size={16} />
              New corrective action
            </Link>
          ) : undefined
        }
      />

      <CorrectiveActionFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        sites={sites.data?.sites ?? []}
      />

      {actions.isError && !actions.data ? (
        <ErrorState
          title="Unable to load corrective actions"
          message={
            actions.error instanceof Error
              ? actions.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void actions.refetch()}
              isLoading={actions.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : actions.isLoading ? (
        <Spinner label="Loading corrective actions..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? "No actions match these filters"
              : "No corrective actions yet"
          }
          description={
            filtersActive
              ? "Adjust the site, status, source or overdue filters to see more results."
              : "Actions raised from incidents, near misses and HSE observations will appear here."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Link
                href="/corrective-actions/new"
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                New corrective action
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Actions are ordered by due date, earliest first.
            </p>
            <Badge tone="neutral">
              {actions.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} action${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <CorrectiveActionRegisterTable actions={items} />

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
