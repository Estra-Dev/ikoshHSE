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
import { useToolboxTalks } from "@/lib/api/toolbox-talks";
import { useProjects, useSites } from "@/lib/api/worksites";
import {
  buildToolboxTalkFilterSearchParams,
  hasActiveToolboxTalkFilters,
  parseToolboxTalkFilters,
  type ToolboxTalkFilterState,
} from "@/lib/toolbox-talks";
import { canCreateToolboxTalks } from "@/lib/permissions";
import { ToolboxTalkFilters } from "./toolbox-talk-filters";
import { ToolboxTalkRegisterTable } from "./toolbox-talk-register-table";

/**
 * Toolbox talk register. Filter state is mirrored into the URL so views are
 * shareable and survive refreshes. Site scoping and authorization stay
 * server-side.
 */
export function ToolboxTalkRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const projects = useProjects();
  const filters = useMemo(
    () =>
      parseToolboxTalkFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const sites = useSites({ projectId: filters.projectId, page: 1, limit: 100 });
  const talks = useToolboxTalks(filters);

  const navigate = useCallback(
    (next: ToolboxTalkFilterState) => {
      const params = buildToolboxTalkFilterSearchParams(next);
      const query = params.toString();
      router.replace(query ? `/toolbox-talks?${query}` : "/toolbox-talks");
    },
    [router],
  );

  const handleChange = useCallback(
    (partial: Partial<ToolboxTalkFilterState>) => {
      navigate({
        ...filters,
        ...partial,
        page: partial.page ?? 1,
      });
    },
    [filters, navigate],
  );

  const handleReset = useCallback(() => {
    router.replace("/toolbox-talks");
  }, [router]);

  const items = talks.data?.talks ?? [];
  const pagination = talks.data?.pagination;
  const canCreate = canCreateToolboxTalks(me.data?.employee.ikoshRole);
  const filtersActive = hasActiveToolboxTalkFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="Toolbox talks"
        description="Site briefings, attendee acknowledgement evidence and delivery history. Visibility is scoped by site."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/toolbox-talks/my"
              className={buttonStyles("secondary")}
            >
              My toolbox talks
            </Link>
            {canCreate && (
              <Link
                href="/toolbox-talks/new"
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                Schedule talk
              </Link>
            )}
          </div>
        }
      />

      <ToolboxTalkFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        projects={projects.data?.projects ?? []}
        sites={sites.data?.sites ?? []}
      />

      {talks.isError && !talks.data ? (
        <ErrorState
          title="Unable to load toolbox talks"
          message={
            talks.error instanceof Error
              ? talks.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void talks.refetch()}
              isLoading={talks.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : talks.isLoading ? (
        <Spinner label="Loading toolbox talks..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? "No toolbox talks match these filters"
              : "No toolbox talks scheduled yet"
          }
          description={
            filtersActive
              ? "Adjust the search, status, project, site or date filters to see more results."
              : "Scheduled talks will appear here once a supervisor or the HSE team creates them."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Link
                href="/toolbox-talks/new"
                className={buttonStyles("primary")}
              >
                <PlusIcon size={16} />
                Schedule talk
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Talks are ordered by scheduled date, most recent first.
            </p>
            <Badge tone="neutral">
              {talks.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} talk${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <ToolboxTalkRegisterTable talks={items} />

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
