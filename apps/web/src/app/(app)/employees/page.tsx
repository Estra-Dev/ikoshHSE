"use client";

import { Suspense, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmployeeDirectoryTable } from "@/components/employees/employee-directory-table";
import { EmployeeFilters } from "@/components/employees/employee-filters";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import {
  buildDirectorySearchParams,
  parseDirectorySearchParams,
  type DirectoryFilterState,
} from "@/lib/api/directory-filters";
import { useEmployeeDirectory, useMe } from "@/lib/api/employees";
import { canListInactiveEmployees } from "@/lib/permissions";

/**
 * Employee directory. Filter state is mirrored into the URL query string so
 * views are shareable and survive refreshes. All authorization (who may be
 * listed, who sees sensitive fields) is enforced by the API.
 */
export default function EmployeesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading directory..." />}>
      <EmployeeDirectory />
    </Suspense>
  );
}

function EmployeeDirectory() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const me = useMe();
  const filters = useMemo(
    () => parseDirectorySearchParams(searchParams),
    [searchParams],
  );

  const updateFilters = useCallback(
    (partial: Partial<DirectoryFilterState>) => {
      const next = { ...filters, ...partial };
      // Any filter change restarts pagination, unless the page itself
      // changed (e.g. the pagination controls).
      if (partial.page === undefined) {
        next.page = 1;
      }

      router.replace(
        `${pathname}?${buildDirectorySearchParams(next).toString()}`,
        { scroll: false },
      );
    },
    [filters, pathname, router],
  );

  const directory = useEmployeeDirectory({ filters });

  const viewerRole = me.data?.employee.ikoshRole;
  const canListInactive = canListInactiveEmployees(viewerRole);

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (directory.isError) {
    return (
      <ErrorState
        title="Unable to load the employee directory"
        message={
          directory.error instanceof Error
            ? directory.error.message
            : undefined
        }
      />
    );
  }

  const employees = directory.data?.employees ?? [];
  const pagination = directory.data?.pagination;
  const isEmpty =
    directory.isSuccess && employees.length === 0 && !filters.q.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Employee directory"
        description="Browse active IKOSH employees. Click a name to view their profile."
      />

      <EmployeeFilters
        filters={filters}
        onChange={updateFilters}
        canListInactive={canListInactive}
      />

      {directory.isLoading || directory.isFetching ? (
        <div className="space-y-2">
          <p className="text-right text-xs text-muted">Updating…</p>
          <Spinner label="Loading employees..." />
        </div>
      ) : isEmpty ? (
        <EmptyState
          title="No employees found"
          description="The directory is currently empty."
        />
      ) : employees.length === 0 ? (
        <EmptyState
          title="No employees match your filters"
          description="Try adjusting the search or clearing the filters."
        />
      ) : (
        <EmployeeDirectoryTable employees={employees} />
      )}

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={(page) => updateFilters({ page })}
        />
      )}
    </div>
  );
}
