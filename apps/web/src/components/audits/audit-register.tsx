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
import { useAuditAssignees, useAudits } from "@/lib/api/audits";
import { useSites } from "@/lib/api/worksites";
import {
  buildAuditFilterSearchParams,
  hasActiveAuditFilters,
  parseAuditFilters,
  type AuditFilterState,
} from "@/lib/audits";
import { canCreateAudits } from "@/lib/permissions";
import { AuditFilters } from "./audit-filters";
import { AuditRegisterTable } from "./audit-register-table";

/**
 * HSE audit register. Filter state is mirrored into the URL so views are
 * shareable and survive refreshes. Scoping and authorization stay server-side.
 */
export function AuditRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const sites = useSites();
  const assignees = useAuditAssignees();

  const filters = useMemo(
    () => parseAuditFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const audits = useAudits(filters);

  const navigate = useCallback(
    (next: AuditFilterState) => {
      const params = buildAuditFilterSearchParams(next);
      const query = params.toString();
      router.replace(query ? `/audits?${query}` : "/audits");
    },
    [router],
  );

  const handleChange = useCallback(
    (partial: Partial<AuditFilterState>) => {
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
    router.replace("/audits");
  }, [router]);

  const items = audits.data?.audits ?? [];
  const pagination = audits.data?.pagination;
  const canCreate = canCreateAudits(me.data?.employee.ikoshRole);
  const filtersActive = hasActiveAuditFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="HSE audits"
        description="Scheduled internal, external, supplier and certification audits, from planning through checklist results and findings. Visibility is scoped by site and auditor assignment."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void audits.refetch()}
              isLoading={audits.isFetching}
            >
              <RefreshIcon size={16} />
              Refresh
            </Button>
            {canCreate && (
              <Link href="/audits/new" className={buttonStyles("primary")}>
                <PlusIcon size={16} />
                New audit
              </Link>
            )}
          </div>
        }
      />

      <AuditFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        sites={sites.data?.sites ?? []}
        auditors={assignees.data?.assignees ?? []}
      />

      {audits.isError && !audits.data ? (
        <ErrorState
          title="Unable to load audits"
          message={
            audits.error instanceof Error
              ? audits.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void audits.refetch()}
              isLoading={audits.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : audits.isLoading ? (
        <Spinner label="Loading audits..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? "No audits match these filters"
              : "No audits scheduled yet"
          }
          description={
            filtersActive
              ? "Adjust the search, site, status, type or auditor filters to see more results."
              : "Audits scheduled by the HSE team will appear here."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Link href="/audits/new" className={buttonStyles("primary")}>
                <PlusIcon size={16} />
                New audit
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Audits are ordered by scheduled date, most recent first.
            </p>
            <Badge tone="neutral">
              {audits.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} audit${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <AuditRegisterTable audits={items} />

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
