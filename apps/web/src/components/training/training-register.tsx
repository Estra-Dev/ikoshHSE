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
import { useTrainingCourses, useTrainingSessions } from "@/lib/api/training";
import { useProjects, useSites } from "@/lib/api/worksites";
import {
  buildTrainingFilterSearchParams,
  hasActiveTrainingFilters,
  parseTrainingFilters,
  type TrainingFilterState,
} from "@/lib/training";
import { canCreateTraining, canManageTraining } from "@/lib/permissions";
import { TrainingFilters } from "./training-filters";
import { TrainingRegisterTable } from "./training-register-table";

/**
 * Training register. Filter state is mirrored into the URL so views are
 * shareable and survive refreshes. Site scoping and authorization stay
 * server-side.
 */
export function TrainingRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const courses = useTrainingCourses();
  const projects = useProjects();
  const filters = useMemo(
    () => parseTrainingFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const sites = useSites({ projectId: filters.projectId, page: 1, limit: 100 });
  const training = useTrainingSessions(filters);

  const navigate = useCallback(
    (next: TrainingFilterState) => {
      const params = buildTrainingFilterSearchParams(next);
      const query = params.toString();
      router.replace(query ? `/training?${query}` : "/training");
    },
    [router],
  );

  const handleChange = useCallback(
    (partial: Partial<TrainingFilterState>) => {
      navigate({
        ...filters,
        ...partial,
        page: partial.page ?? 1,
      });
    },
    [filters, navigate],
  );

  const handleReset = useCallback(() => {
    router.replace("/training");
  }, [router]);

  const items = training.data?.sessions ?? [];
  const pagination = training.data?.pagination;
  const role = me.data?.employee.ikoshRole;
  const canCreate = canCreateTraining(role);
  const canManage = canManageTraining(role);
  const filtersActive = hasActiveTrainingFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="Training register"
        description="Scheduled HSE training, participant attendance and certificate records. Visibility is scoped by site."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/training/my" className={buttonStyles("secondary")}>
              My training
            </Link>
            {canManage && (
              <Link
                href="/training/courses"
                className={buttonStyles("secondary")}
              >
                Manage courses
              </Link>
            )}
            {canCreate && (
              <Link href="/training/new" className={buttonStyles("primary")}>
                <PlusIcon size={16} />
                Schedule training
              </Link>
            )}
          </div>
        }
      />

      <TrainingFilters
        filters={filters}
        onChange={handleChange}
        onReset={handleReset}
        courses={courses.data?.courses ?? []}
        projects={projects.data?.projects ?? []}
        sites={sites.data?.sites ?? []}
      />

      {training.isError && !training.data ? (
        <ErrorState
          title="Unable to load training sessions"
          message={
            training.error instanceof Error
              ? training.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void training.refetch()}
              isLoading={training.isFetching}
            >
              <RefreshIcon size={16} />
              Try again
            </Button>
          }
        />
      ) : training.isLoading ? (
        <Spinner label="Loading training sessions..." />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? "No training sessions match these filters"
              : "No training sessions scheduled yet"
          }
          description={
            filtersActive
              ? "Adjust the search, status, course, project, site or date filters to see more results."
              : "Scheduled sessions will appear here once the HSE team creates them."
          }
          action={
            filtersActive ? (
              <Button variant="secondary" onClick={handleReset}>
                Reset filters
              </Button>
            ) : canCreate ? (
              <Link href="/training/new" className={buttonStyles("primary")}>
                <PlusIcon size={16} />
                Schedule training
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              Sessions are ordered by scheduled date, most recent first.
            </p>
            <Badge tone="neutral">
              {training.isFetching
                ? "Updating…"
                : `${pagination?.total ?? items.length} session${
                    (pagination?.total ?? items.length) === 1 ? "" : "s"
                  }`}
            </Badge>
          </div>

          <TrainingRegisterTable sessions={items} />

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
