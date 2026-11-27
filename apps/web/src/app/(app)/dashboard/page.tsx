"use client";

import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useMe } from "@/lib/api/employees";
import { useHseDashboard, useSiteHseDashboards } from "@/lib/api/hse";
import { useHseReport } from "@/lib/api/reports";
import { useProjects, useSites } from "@/lib/api/worksites";
import { Button, ErrorState, Spinner } from "@/components/ui/feedback";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshIcon } from "@/components/icons";
import { CategoryMix } from "@/components/dashboard/category-mix";
import {
  CapaStatusChart,
  PermitStatusChart,
  RiskLevelChart,
} from "@/components/dashboard/chart-panels";
import { DashboardKpis } from "@/components/dashboard/dashboard-kpis";
import { LatestReports } from "@/components/dashboard/latest-reports";
import { ManagementAttention } from "@/components/dashboard/management-attention";
import { MyReports } from "@/components/dashboard/my-reports";
import { OutstandingQueues } from "@/components/dashboard/outstanding-queues";
import { ReportingTrend } from "@/components/dashboard/reporting-trend";
import { SitePerformance } from "@/components/dashboard/site-performance";
import { DashboardScopeControls } from "@/components/dashboard/scope-controls";
import { StatusPipeline } from "@/components/dashboard/status-pipeline";
import { canViewReports } from "@/lib/permissions";
import {
  buildReportFilters,
  canScopeRecentReports,
  deriveDashboardKpis,
  deriveReportKpis,
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

  const me = useMe();
  const projects = useProjects();
  const sites = useSites({ projectId: filters.projectId });
  const dashboardQuery = useHseDashboard(filters);

  const reportsAllowed = canViewReports(me.data?.employee.ikoshRole);
  const reportFilters = useMemo(() => buildReportFilters(filters), [filters]);
  const reportQuery = useHseReport(reportFilters, {
    enabled: reportsAllowed,
  });

  const siteList = sites.data?.sites ?? [];
  const comparisonSites = selectComparisonSites(siteList, filters);
  const comparisonQueries = useSiteHseDashboards(
    filters,
    comparisonSites.map((site) => site.id),
  );

  const dashboard = dashboardQuery.data?.data;
  const kpis = deriveDashboardKpis(dashboard);
  const report = reportQuery.data?.data;
  const reportKpis = deriveReportKpis(report);

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

  const detailsScopable = canScopeRecentReports(filters);
  const reportChartProps = {
    report,
    siteId: filters.siteId,
    isLoading: reportsAllowed && reportQuery.isLoading,
    error: reportsAllowed ? reportQuery.error : undefined,
    onRetry: () => void reportQuery.refetch(),
  };

  function refreshAll() {
    void dashboardQuery.refetch();
    if (reportsAllowed) {
      void reportQuery.refetch();
    }
    comparisonQueries.forEach((query) => void query.refetch());
  }

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
    <div className="space-y-7">
      <PageHeader
        eyebrow="HSE operations"
        title="HSE command centre"
        description="Live incidents, corrective actions, permits, inspections and risk assurance across the sites in your scope. Every figure comes from existing, site-scoped HSE records."
        actions={
          <Button
            variant="secondary"
            onClick={refreshAll}
            isLoading={dashboardQuery.isFetching || reportQuery.isFetching}
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
        isFetching={dashboardQuery.isFetching || reportQuery.isFetching}
        lastUpdated={dashboard?.lastUpdated}
        projectsLoading={projects.isLoading}
        sitesLoading={sites.isLoading}
        onRangeChange={handleRangeChange}
        onProjectChange={handleProjectChange}
        onSiteChange={handleSiteChange}
      />

      <section aria-labelledby="dashboard-kpi-title" className="space-y-2">
        <h2
          id="dashboard-kpi-title"
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600"
        >
          Key indicators
        </h2>
        <DashboardKpis
          kpis={kpis}
          reportKpis={reportKpis}
          showReportKpis={reportsAllowed}
          reportLoading={reportsAllowed && reportQuery.isLoading}
          reportError={reportsAllowed ? reportQuery.error : undefined}
          siteId={filters.siteId}
        />
        {reportsAllowed && (
          <p className="text-xs leading-5 text-muted">
            Date-filtered figures follow the selected range. Overdue CAPAs,
            permit expiry and certificate flags reflect current status.
          </p>
        )}
        {me.isLoading && (
          <p role="status" className="text-xs text-muted">
            Checking role-based report access…
          </p>
        )}
        {me.isError && (
          <p role="alert" className="text-xs text-red-700">
            Role-based report panels are unavailable until your profile loads.
          </p>
        )}
      </section>

      <MyReports sites={siteList} />

      {reportsAllowed &&
        (detailsScopable ? (
          <ManagementAttention filters={filters} />
        ) : (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">
                Detailed attention queues are site-scoped. Select a site to view
                them; aggregate figures above still follow the selected project.
              </p>
            </CardBody>
          </Card>
        ))}

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

          <section aria-labelledby="dashboard-charts-title" className="space-y-3">
            <div>
              <h2
                id="dashboard-charts-title"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600"
              >
                Risk picture
              </h2>
              <p className="mt-1 text-sm text-muted">
                Trends and distributions from live HSE records in the selected
                scope.
              </p>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ReportingTrend
                  trend={dashboard.incidents.trend}
                  siteId={filters.siteId}
                />
              </div>
              <CategoryMix
                categories={dashboard.incidents.byCategory}
                unclassified={dashboard.incidents.unclassified}
                siteId={filters.siteId}
              />
            </div>

            {reportsAllowed && (
              <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                <CapaStatusChart {...reportChartProps} />
                <PermitStatusChart {...reportChartProps} />
                <RiskLevelChart {...reportChartProps} />
              </div>
            )}
          </section>

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
            <OutstandingQueues dashboard={dashboard} />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <StatusPipeline byStatus={dashboard.incidents.byStatus} />
            </div>
            <LatestReports filters={filters} sites={siteList} />
          </div>
        </>
      )}
    </div>
  );
}
