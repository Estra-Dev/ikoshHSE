"use client";

import { useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import { StatCard } from "@/components/ui/stat-card";
import { useMe } from "@/lib/api/employees";
import { useHseReport } from "@/lib/api/reports";
import { useProjects, useSites } from "@/lib/api/worksites";
import type { HseReport } from "@/lib/api/types";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  buildReportCsv,
  EMPTY_REPORT_FILTERS,
  hasActiveReportFilters,
  type ReportFilterState,
} from "@/lib/reports";
import { canViewReports } from "@/lib/permissions";
import { ChartIcon, RefreshIcon } from "@/components/icons";

function label(value: string): string {
  return value.replaceAll("_", " ").toLowerCase();
}

function DistributionTable({
  values,
  caption,
}: {
  values: Record<string, number>;
  caption?: string;
}) {
  const entries = Object.entries(values).filter(([, count]) => count > 0);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted">{caption ?? "No records"} in scope.</p>
    );
  }

  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {entries.map(([key, count]) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-3 border-b border-line/70 pb-1"
        >
          <dt className="text-sm capitalize text-muted">{label(key)}</dt>
          <dd className="tabular text-sm font-semibold text-ink">{count}</dd>
        </div>
      ))}
    </dl>
  );
}

function CountedList({
  rows,
  nameKey,
  caption,
}: {
  rows: readonly { count: number }[];
  nameKey: string;
  caption?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">{caption ?? "No records"} in scope.</p>
    );
  }

  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map((row) => {
        const name = (row as Record<string, unknown>)[nameKey];
        return (
          <div
            key={String(name)}
            className="flex items-baseline justify-between gap-3 border-b border-line/70 pb-1"
          >
            <dt className="text-sm capitalize text-muted">
              {String(name).replaceAll("_", " ").toLowerCase()}
            </dt>
            <dd className="tabular text-sm font-semibold text-ink">
              {row.count}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function SummaryCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function ReportContents({ report }: { report: HseReport }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Incidents & near misses"
          value={report.incidents.total}
          hint={`${report.incidents.incidents} incidents · ${report.incidents.nearMisses} near misses`}
        />
        <StatCard
          label="Inspections"
          value={report.inspections.total}
          hint={`${report.inspections.findingsTotal} finding${
            report.inspections.findingsTotal === 1 ? "" : "s"
          }`}
          tone="violet"
        />
        <StatCard
          label="Audits"
          value={report.audits.total}
          hint={`${report.audits.findingsTotal} finding${
            report.audits.findingsTotal === 1 ? "" : "s"
          }`}
          tone="violet"
        />
        <StatCard
          label="Permits to work"
          value={report.permits.total}
          hint={`${report.permits.expiringSoon} expiring within 7 days`}
          tone="amber"
        />
        <StatCard
          label="Corrective actions"
          value={report.correctiveActions.total}
          hint={`${report.correctiveActions.overdue} overdue`}
          tone={report.correctiveActions.overdue > 0 ? "red" : "green"}
        />
        <StatCard
          label="Risk assessments"
          value={report.riskAssessments.total}
          hint={`${report.riskAssessments.hazardsTotal} hazard lines · ${report.riskAssessments.reviewsDue} reviews due`}
        />
        <StatCard
          label="Training sessions"
          value={report.training.sessions}
          hint={`${report.training.attendance.attended} attended · ${report.training.attendance.certificatesIssued} certificates`}
          tone="green"
        />
        <StatCard
          label="Toolbox talks"
          value={report.toolboxTalks.talks}
          hint={`${report.toolboxTalks.attendance.attended} attended · ${report.toolboxTalks.attendance.acknowledged} acknowledged`}
          tone="green"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SummaryCard
          title="Incidents"
          description="Status distribution and classified categories."
        >
          <div className="space-y-4">
            <DistributionTable values={report.incidents.byStatus} />
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Categories
              </p>
              <CountedList
                rows={report.incidents.byCategory}
                nameKey="category"
                caption="No classified incidents"
              />
              {report.incidents.unclassified > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {report.incidents.unclassified} unclassified incident
                  {report.incidents.unclassified === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          </div>
        </SummaryCard>

        <SummaryCard
          title="Inspections"
          description="Scheduled inspections and finding severity."
        >
          <div className="space-y-4">
            <DistributionTable values={report.inspections.byStatus} />
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Findings by severity
              </p>
              <DistributionTable values={report.inspections.findingsBySeverity} />
            </div>
          </div>
        </SummaryCard>

        <SummaryCard
          title="Audits"
          description="Audit schedule, type, checklist results and findings."
        >
          <div className="space-y-4">
            <DistributionTable values={report.audits.byStatus} />
            <DistributionTable values={report.audits.byType} />
            <DistributionTable values={report.audits.checklistByResult} />
            <DistributionTable values={report.audits.findingsBySeverity} />
          </div>
        </SummaryCard>

        <SummaryCard
          title="Permits to work"
          description="Permit lifecycle and work types."
        >
          <div className="space-y-4">
            <DistributionTable values={report.permits.byStatus} />
            <CountedList
              rows={report.permits.byWorkType}
              nameKey="workType"
              caption="No permits"
            />
          </div>
        </SummaryCard>

        <SummaryCard
          title="Corrective actions"
          description="Open workload and overdue status."
        >
          <DistributionTable values={report.correctiveActions.byStatus} />
        </SummaryCard>

        <SummaryCard
          title="Risk assessments"
          description="Assessment status and residual risk of recorded hazards."
        >
          <div className="space-y-4">
            <DistributionTable values={report.riskAssessments.byStatus} />
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Residual risk
              </p>
              <DistributionTable
                values={report.riskAssessments.hazardsByResidualLevel}
              />
            </div>
          </div>
        </SummaryCard>

        <SummaryCard
          title="Training"
          description="Session status and attendance counts."
        >
          <div className="space-y-4">
            <DistributionTable values={report.training.byStatus} />
            <DistributionTable
              values={{
                invited: report.training.attendance.invited,
                attended: report.training.attendance.attended,
                absent: report.training.attendance.absent,
                completed: report.training.attendance.completed,
                certificates: report.training.attendance.certificatesIssued,
                employees: report.training.attendance.employees,
                contractors: report.training.attendance.contractors,
              }}
            />
          </div>
        </SummaryCard>

        <SummaryCard
          title="Toolbox talks"
          description="Talk status, attendance and acknowledgement counts."
        >
          <div className="space-y-4">
            <DistributionTable values={report.toolboxTalks.byStatus} />
            <DistributionTable
              values={{
                invited: report.toolboxTalks.attendance.invited,
                attended: report.toolboxTalks.attendance.attended,
                absent: report.toolboxTalks.attendance.absent,
                acknowledged: report.toolboxTalks.attendance.acknowledged,
                employees: report.toolboxTalks.attendance.employees,
                contractors: report.toolboxTalks.attendance.contractors,
              }}
            />
          </div>
        </SummaryCard>
      </div>
    </div>
  );
}

/** Cross-module HSE report with date/project/site filters and CSV export. */
export function HseReports() {
  const me = useMe();
  const projects = useProjects();
  const [filters, setFilters] = useState<ReportFilterState>(EMPTY_REPORT_FILTERS);
  const sites = useSites({ projectId: filters.projectId, limit: 100 });
  const report = useHseReport(filters);

  const scopeLabel = useMemo(() => {
    const project = projects.data?.projects.find(
      (entry) => entry.id === filters.projectId,
    );
    const site = sites.data?.sites.find((entry) => entry.id === filters.siteId);

    return [
      project ? project.name : "All accessible projects",
      site ? site.name : "All accessible sites",
      filters.from || filters.to
        ? `${filters.from || "start"} to ${filters.to || "today"}`
        : "All dates",
    ].join(" · ");
  }, [filters, projects.data, sites.data]);

  function updateFilters(partial: Partial<ReportFilterState>) {
    setFilters((current) => ({ ...current, ...partial }));
  }

  function handleExport() {
    const data = report.data?.data;

    if (!data) {
      return;
    }

    const blob = new Blob([buildReportCsv(data)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ikosh-hse-report-${data.generatedAt.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (me.isLoading) {
    return <Spinner label="Checking report access..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (!canViewReports(me.data?.employee.ikoshRole)) {
    return (
      <ErrorState
        title="Access restricted"
        message="HSE reports are available to HSE staff only."
      />
    );
  }

  const data = report.data?.data;
  const filtersActive = hasActiveReportFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="HSE reports"
        description="Aggregate counts from incidents, near misses, inspections, audits, permits, corrective actions, risk assessments, training and toolbox talks. Every figure uses the same site and role boundaries as its register."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={!data}
            >
              <ChartIcon size={16} />
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
              disabled={!data}
            >
              Print / PDF
            </Button>
          </>
        }
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField
            label="Project"
            id="report-project"
            value={filters.projectId}
            onChange={(event) =>
              updateFilters({ projectId: event.target.value, siteId: "" })
            }
            options={[
              { value: "", label: "All accessible projects" },
              ...(projects.data?.projects ?? []).map((project) => ({
                value: project.id,
                label: project.name,
              })),
            ]}
          />
          <SelectField
            label="Site"
            id="report-site"
            value={filters.siteId}
            onChange={(event) => updateFilters({ siteId: event.target.value })}
            options={[
              { value: "", label: "All accessible sites" },
              ...(sites.data?.sites ?? []).map((site) => ({
                value: site.id,
                label: `${site.name} · ${site.code}`,
              })),
            ]}
          />
          <TextField
            label="From"
            id="report-from"
            type="date"
            value={filters.from}
            onChange={(event) => updateFilters({ from: event.target.value })}
          />
          <TextField
            label="To"
            id="report-to"
            type="date"
            value={filters.to}
            onChange={(event) => updateFilters({ to: event.target.value })}
          />
          <div className="flex items-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setFilters(EMPTY_REPORT_FILTERS)}
              disabled={!filtersActive}
            >
              Reset
            </Button>
            <Button
              variant="ghost"
              onClick={() => void report.refetch()}
              isLoading={report.isFetching}
            >
              <RefreshIcon size={16} />
              Refresh
            </Button>
          </div>
        </CardBody>
      </Card>

      <p className="text-sm text-muted">{scopeLabel}</p>

      {report.isError && !report.data ? (
        <ErrorState
          title="Unable to load HSE reports"
          message={
            report.error instanceof Error
              ? report.error.message
              : "Please try again."
          }
          action={
            <Button
              onClick={() => void report.refetch()}
              isLoading={report.isFetching}
            >
              Try again
            </Button>
          }
        />
      ) : report.isLoading ? (
        <Spinner label="Building HSE reports..." />
      ) : !data ? (
        <EmptyState
          title="No report data"
          description="Adjust the scope filters or try again."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>Generated {formatUtcDateTime(data.generatedAt)}</span>
            {report.isFetching && <span>Updating…</span>}
          </div>
          <ReportContents report={data} />
        </>
      )}
    </div>
  );
}
