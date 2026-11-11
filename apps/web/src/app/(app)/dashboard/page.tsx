"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useHseDashboard, useSiteHseDashboards } from "@/lib/api/hse";
import { useProjects, useSites } from "@/lib/api/worksites";
import { Button, ErrorState, Spinner } from "@/components/ui/feedback";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshIcon } from "@/components/icons";
import { CategoryMix } from "@/components/dashboard/category-mix";
import { DashboardKpis } from "@/components/dashboard/dashboard-kpis";
import { LatestReports } from "@/components/dashboard/latest-reports";
import { OutstandingQueues } from "@/components/dashboard/outstanding-queues";
import { ReportingTrend } from "@/components/dashboard/reporting-trend";
import { SitePerformance } from "@/components/dashboard/site-performance";
import { DashboardScopeControls } from "@/components/dashboard/scope-controls";
import { StatusPipeline } from "@/components/dashboard/status-pipeline";
import {
  deriveDashboardKpis,
  EMPTY_DASHBOARD_FILTERS,
  selectComparisonSites,
  type DashboardRange,
  type DashboardScopeFilters,
} from "@/lib/hse-dashboard";

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<DashboardScopeFilters>(
    EMPTY_DASHBOARD_FILTERS,
  );

  const projects = useProjects();
  const sites = useSites({ projectId: filters.projectId });
  const dashboardQuery = useHseDashboard(filters);

  const siteList = sites.data?.sites ?? [];
  const comparisonSites = selectComparisonSites(siteList, filters);
  const comparisonQueries = useSiteHseDashboards(
    filters,
    comparisonSites.map((site) => site.id),
  );

  const dashboard = dashboardQuery.data?.data;
  const kpis = deriveDashboardKpis(dashboard);

  const selectedProject = filters.projectId
    ? projects.data?.projects.find(
        (project) => project.id === filters.projectId,
      )
    : undefined;
  const selectedSite = filters.siteId
    ? siteList.find((site) => site.id === filters.siteId)
    : undefined;

  const scopeLabel = filters.siteId
    ? (selectedSite?.name ?? "Selected site")
    : filters.projectId
      ? (selectedProject?.name ?? "Selected project")
      : "All accessible sites";

  const scopeNote = dashboard
    ? `${plural(dashboard.totals.projects, "project")} · ${plural(
        dashboard.totals.sites,
        "site",
      )}`
    : dashboardQuery.isError
      ? "Scope unavailable"
      : "Loading scope…";

  const comparisonError =
    dashboardQuery.error instanceof ApiError &&
    dashboardQuery.error.status === 404 &&
    Boolean(filters.projectId);

  function handleRangeChange(range: DashboardRange) {
    setFilters((current) => ({ ...current, range }));
  }

  function handleProjectChange(projectId: string) {
    setFilters((current) => ({ ...current, projectId, siteId: "" }));
  }

  function handleSiteChange(siteId: string) {
    setFilters((current) => ({ ...current, siteId }));
  }

  function clearScope() {
    setFilters(EMPTY_DASHBOARD_FILTERS);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="HSE operations"
        title="HSE command centre"
        description="Incidents, near misses and reporting assurance across the sites in your scope. Every figure is derived from live, site-scoped HSE records."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void dashboardQuery.refetch();
              void comparisonQueries.forEach((query) => query.refetch());
            }}
            isLoading={dashboardQuery.isFetching}
          >
            <RefreshIcon size={16} />
            Refresh
          </Button>
        }
      />

      <DashboardScopeControls
        range={filters.range}
        projectId={filters.projectId}
        siteId={filters.siteId}
        projects={projects.data?.projects ?? []}
        sites={siteList}
        scopeLabel={scopeLabel}
        scopeNote={scopeNote}
        isFetching={dashboardQuery.isFetching}
        lastUpdated={dashboard?.lastUpdated}
        projectsLoading={projects.isLoading}
        sitesLoading={sites.isLoading}
        onRangeChange={handleRangeChange}
        onProjectChange={handleProjectChange}
        onSiteChange={handleSiteChange}
      />

      <DashboardKpis kpis={kpis} />

      {dashboardQuery.isError && !dashboard ? (
        <ErrorState
          title="Unable to load HSE aggregates"
          message={
            comparisonError
              ? "The selected project is not available in your site scope. Choose another project or clear the scope filters."
              : dashboardQuery.error instanceof Error
                ? dashboardQuery.error.message
                : "Please try again."
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void dashboardQuery.refetch()}
                isLoading={dashboardQuery.isFetching}
              >
                <RefreshIcon size={16} />
                Try again
              </Button>
              {(filters.projectId || filters.siteId) && (
                <Button variant="secondary" onClick={clearScope}>
                  Clear scope
                </Button>
              )}
            </div>
          }
        />
      ) : dashboardQuery.isLoading || !dashboard ? (
        <Card>
          <CardBody>
            <Spinner label="Loading HSE command centre..." />
          </CardBody>
        </Card>
      ) : (
        <>
          {dashboardQuery.isError && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
            >
              The latest aggregates could not be refreshed. Showing the last
              loaded figures.
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ReportingTrend trend={dashboard.incidents.trend} />
            </div>
            <OutstandingQueues dashboard={dashboard} />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SitePerformance
                sites={comparisonSites}
                dashboards={comparisonQueries.map(
                  (query) => query.data?.data,
                )}
                overall={dashboard}
                totalSites={dashboard.totals.sites}
                isLoading={
                  sites.isLoading ||
                  comparisonQueries.some((query) => query.isPending)
                }
                failedSites={
                  comparisonQueries.filter((query) => query.isError).length
                }
                siteFilterActive={Boolean(filters.siteId)}
              />
            </div>
            <StatusPipeline byStatus={dashboard.incidents.byStatus} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <CategoryMix
              categories={dashboard.incidents.byCategory}
              unclassified={dashboard.incidents.unclassified}
            />
            <LatestReports filters={filters} sites={siteList} />
          </div>
        </>
      )}
    </div>
  );
}
