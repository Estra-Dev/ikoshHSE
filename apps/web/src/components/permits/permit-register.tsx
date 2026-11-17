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
import { usePermitAssignees, usePermits } from "@/lib/api/permits";
import { useSites } from "@/lib/api/worksites";
import {
  buildPermitFilterSearchParams,
  hasActivePermitFilters,
  parsePermitFilters,
  type PermitFilterState,
} from "@/lib/permits";
import { canCreatePermits } from "@/lib/permissions";
import { PermitFilters } from "./permit-filters";
import { PermitRegisterTable } from "./permit-register-table";

/**
 * Permit register. Filter state is mirrored into the URL so views are shareable
 * and survive refreshes. All scoping and authorization is enforced by the API.
 */
export function PermitRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const sites = useSites();
  const assignees = usePermitAssignees();

  const filters = useMemo(
    () => parsePermitFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const permits = usePermits(filters);

  const navigate = useCallback(
    (next: PermitFilterState) => {
      const params = buildPermitFilterSearchParams(next);
      const query = params.toString();
      router.replace(query ? `/permits?${query}` : "/permits");
    },
    [router],
  );

  const handleChange = useCallback(
    (partial: Partial<PermitFilterState>) => {
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
    router.replace("/permits");
  }, [router]);

  const items = permits.data?.permits ?? [];
  const pagination = permits.data?.pagination;
  const canCreate = canCreatePermits(me.data?.employee.ikoshRole);
  const filtersActive = hasActivePermitFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Permits to work"
        description="Work authorisations with hazard controls, validity windows and an approval trail. Visibility is scoped by site, creator and responsible person."
        actions={
          canCreate ? (
            <Link href="/permits/new" className={buttonStyles("primary")}>
              <PlusIcon size={16} />
              Raise permit
            </Link>
          ) : undefined
        }
      />

      <PermitFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        sites={sites.data?.sites ?? []}
        assignees={assignees.data?.assignees ?? []}
      />

      {permits.isError && !permits.data ? (
        <ErrorState
          title="Unable to load permits"
          message={
            permits.error instanceof Error
              ? permits.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void permits.refetch()}
              isLoading={permits.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : permits.isLoading ? (
        <Spinner label="Loading permits..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? "No permits match these filters"
              : "No permits raised yet"
          }
          description={
            filtersActive
              ? "Adjust the search, site, status, work type or responsible person filters to see more results."
              : "Permits will appear here once the HSE team raises them."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Link href="/permits/new" className={buttonStyles("primary")}>
                <PlusIcon size={16} />
                Raise permit
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Permits are ordered by validity start, most recent first. Expired
              permits are marked and must be closed; they cannot be activated.
            </p>
            <Badge tone="neutral">
              {permits.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} permit${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <PermitRegisterTable permits={items} />

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
