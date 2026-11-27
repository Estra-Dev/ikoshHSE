"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RefreshIcon } from "@/components/icons";
import type { HseReport } from "@/lib/api/types";
import {
  CORRECTIVE_ACTION_STATUSES,
  PERMIT_STATUSES,
  RISK_LEVELS,
  type CorrectiveActionStatus,
  type PermitStatus,
} from "@/lib/api/types";
import {
  buildCorrectiveActionFilterSearchParams,
  EMPTY_CORRECTIVE_ACTION_FILTERS,
} from "@/lib/corrective-actions";
import {
  buildPermitFilterSearchParams,
  EMPTY_PERMIT_FILTERS,
} from "@/lib/permits";
import {
  appendSiteFilter,
  chartSeries,
  nonZeroSeries,
  seriesTotal,
  type ChartDatum,
} from "@/lib/hse-dashboard";

const DONUT_STROKES = [
  "stroke-navy-700",
  "stroke-amber-500",
  "stroke-emerald-500",
  "stroke-violet-500",
  "stroke-red-500",
  "stroke-blue-500",
] as const;

const DONUT_DOTS = [
  "bg-navy-700",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-red-500",
  "bg-blue-500",
] as const;

const PERMIT_BAR_COLORS: Record<PermitStatus, string> = {
  DRAFT: "bg-navy-300",
  SUBMITTED: "bg-amber-500",
  APPROVED: "bg-blue-500",
  ACTIVE: "bg-emerald-500",
  SUSPENDED: "bg-red-500",
  CLOSED: "bg-navy-700",
  REJECTED: "bg-red-700",
  CANCELLED: "bg-navy-400",
};

const RISK_BAR_COLORS: Record<string, string> = {
  LOW: "bg-emerald-500",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-red-500",
  CRITICAL: "bg-red-700",
};

function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.some((entry) => entry === value);
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Please try again.";
}

function ChartCard({
  title,
  description,
  isLoading,
  error,
  onRetry,
  children,
}: {
  title: string;
  description: string;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {isLoading ? (
          <Spinner label="Loading chart data..." />
        ) : error ? (
          <div role="alert" className="py-4">
            <p className="text-sm font-medium text-red-700">
              This chart could not be loaded.
            </p>
            <p className="mt-1 text-sm text-muted">{errorText(error)}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={onRetry}
            >
              <RefreshIcon size={14} />
              Try again
            </Button>
          </div>
        ) : (
          children
        )}
      </CardBody>
    </Card>
  );
}

export interface ChartSegment extends ChartDatum {
  href?: string;
  colorClass?: string;
}

function Legend({ segments }: { segments: readonly ChartSegment[] }) {
  return (
    <ul className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
      {segments.map((segment, index) => {
        const content = (
          <>
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                DONUT_DOTS[index % DONUT_DOTS.length]
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {segment.label}
            </span>
            <span className="tabular text-sm font-semibold text-ink">
              {segment.count}
            </span>
          </>
        );

        return (
          <li key={segment.key}>
            {segment.href ? (
              <Link
                href={segment.href}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-navy-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
                title={`View ${segment.label} records`}
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-start gap-2 px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DonutChart({
  segments,
  total,
  totalLabel,
}: {
  segments: readonly ChartSegment[];
  total: number;
  totalLabel: string;
}) {
  const arcs = segments
    .reduce(
      (result, segment) => {
        const length = (segment.count / total) * 100;
        return {
          offset: result.offset + length,
          items: [
            ...result.items,
            { segment, length, dashOffset: result.offset },
          ],
        };
      },
      {
        offset: 0,
        items: [] as {
          segment: ChartSegment;
          length: number;
          dashOffset: number;
        }[],
      },
    ).items;
  const description = segments
    .map((segment) => `${segment.label}: ${segment.count}`)
    .join(", ");

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-44 w-44 shrink-0">
        <svg
          viewBox="0 0 42 42"
          role="img"
          aria-label={`${totalLabel}: ${total}. ${description}`}
          className="h-full w-full -rotate-90"
        >
          <circle
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            strokeWidth="5"
            pathLength={100}
            className="stroke-navy-100"
          />
          {arcs.map(({ segment, length, dashOffset }, index) => (
            <circle
              key={segment.key}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              strokeWidth="5"
              pathLength={100}
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-dashOffset}
              className={DONUT_STROKES[index % DONUT_STROKES.length]}
            >
              <title>{`${segment.label}: ${segment.count}`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold text-navy-900">
            {total}
          </span>
          <span className="max-w-24 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {totalLabel}
          </span>
        </div>
      </div>
      <Legend segments={segments} />
    </div>
  );
}

function BarChart({ segments }: { segments: readonly ChartSegment[] }) {
  const max = Math.max(...segments.map((segment) => segment.count), 1);

  return (
    <ul className="space-y-3.5">
      {segments.map((segment) => {
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-ink">
                {segment.label}
              </span>
              <span className="tabular text-sm font-semibold text-ink">
                {segment.count}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-100">
              <div
                className={`h-full rounded-full ${
                  segment.colorClass ?? "bg-navy-700"
                }`}
                style={{ width: `${(segment.count / max) * 100}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={segment.key} title={`${segment.label}: ${segment.count}`}>
            {segment.href ? (
              <Link
                href={segment.href}
                className="block rounded-lg px-2 py-1 transition hover:bg-navy-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600"
              >
                {content}
              </Link>
            ) : (
              <div className="px-2 py-1">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface ReportChartProps {
  report: HseReport | undefined;
  siteId: string;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function CapaStatusChart({
  report,
  siteId,
  isLoading,
  error,
  onRetry,
}: ReportChartProps) {
  const series = report
    ? chartSeries(
        report.correctiveActions.byStatus,
        CORRECTIVE_ACTION_STATUSES,
      )
    : [];
  const segments = nonZeroSeries(series).map((item) => ({
    ...item,
    href: isOneOf(CORRECTIVE_ACTION_STATUSES, item.key)
      ? appendSiteFilter(
          `/corrective-actions?${buildCorrectiveActionFilterSearchParams({
            ...EMPTY_CORRECTIVE_ACTION_FILTERS,
            siteId,
            status: item.key as CorrectiveActionStatus,
          }).toString()}`,
          siteId,
        )
      : appendSiteFilter("/corrective-actions", siteId),
  }));
  const total = seriesTotal(segments);

  return (
    <ChartCard
      title="CAPA status"
      description="Corrective actions created in the selected period, by workflow status."
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
    >
      {segments.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No corrective actions in this period.
        </p>
      ) : (
        <DonutChart segments={segments} total={total} totalLabel="Actions" />
      )}
    </ChartCard>
  );
}

export function PermitStatusChart({
  report,
  siteId,
  isLoading,
  error,
  onRetry,
}: ReportChartProps) {
  const segments = report
    ? chartSeries(report.permits.byStatus, PERMIT_STATUSES).map((item) => ({
        ...item,
        href: appendSiteFilter(
          isOneOf(PERMIT_STATUSES, item.key)
            ? `/permits?${buildPermitFilterSearchParams({
                ...EMPTY_PERMIT_FILTERS,
                siteId,
                status: item.key as PermitStatus,
              }).toString()}`
            : "/permits",
          siteId,
        ),
        colorClass: isOneOf(PERMIT_STATUSES, item.key)
          ? PERMIT_BAR_COLORS[item.key]
          : "bg-navy-400",
      }))
    : [];

  return (
    <ChartCard
      title="Permit status"
      description="Permits first valid in the selected period, by lifecycle status."
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
    >
      {segments.every((segment) => segment.count === 0) ? (
        <p className="py-8 text-center text-sm text-muted">
          No permits in this period.
        </p>
      ) : (
        <BarChart segments={segments} />
      )}
    </ChartCard>
  );
}

export function RiskLevelChart({
  report,
  siteId,
  isLoading,
  error,
  onRetry,
}: ReportChartProps) {
  const segments = report
    ? chartSeries(
        report.riskAssessments.hazardsByResidualLevel,
        RISK_LEVELS,
      ).map((item) => ({
        ...item,
        href: appendSiteFilter("/risk-assessments", siteId),
        colorClass: RISK_BAR_COLORS[item.key] ?? "bg-navy-700",
      }))
    : [];
  const total = seriesTotal(segments);

  return (
    <ChartCard
      title="Residual risk levels"
      description="Hazard entries by server-derived residual level in assessments created in the selected period."
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
    >
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No hazards with a recorded residual level in this period.
        </p>
      ) : (
        <>
          <BarChart segments={segments} />
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            Hazards recorded:{" "}
            <span className="tabular font-semibold text-ink">{total}</span>
          </p>
        </>
      )}
    </ChartCard>
  );
}
