import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatUtcDate } from "@/lib/dashboard-format";
import { appendSiteFilter, summariseTrend } from "@/lib/hse-dashboard";
import type { HseTrendPoint } from "@/lib/api/types";

function TrendLine({ trend }: { trend: readonly HseTrendPoint[] }) {
  const max = Math.max(...trend.map((point) => point.count), 1);
  const times = trend.map((point) => Date.parse(`${point.date}T00:00:00Z`));
  const first = times[0];
  const last = times[times.length - 1];
  const span = last - first;

  const points = trend.map((point, index) => ({
    x: span === 0 ? 50 : ((times[index] - first) / span) * 100,
    y: 38 - (point.count / max) * 34,
    count: point.count,
    date: point.date,
  }));

  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `0,40 ${line} ${points[points.length - 1].x},40`;
  const midDate = trend[Math.floor(trend.length / 2)].date;

  return (
    <div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Incident reporting trend from ${formatUtcDate(
          trend[0].date,
        )} to ${formatUtcDate(trend[trend.length - 1].date)}`}
        className="h-44 w-full overflow-visible"
      >
        {[8, 16, 24, 32].map((y) => (
          <line
            key={y}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            className="stroke-line"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <polygon points={area} className="fill-navy-50" />

        <polyline
          points={line}
          fill="none"
          className="stroke-navy-700"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        >
          <title>Daily incident and near-miss reports</title>
        </polyline>

        {points.length === 1 && (
          <circle
            cx={points[0].x}
            cy={points[0].y}
            r="2.5"
            className="fill-navy-700"
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {`${points[0].count} reports on ${formatUtcDate(points[0].date)}`}
            </title>
          </circle>
        )}

        {points.length > 1 &&
          points.length <= 20 &&
          points.map((point) => (
            <circle
              key={point.date}
              cx={point.x}
              cy={point.y}
              r="1.6"
              className="fill-navy-700"
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {`${point.count} reports on ${formatUtcDate(point.date)}`}
              </title>
            </circle>
          ))}
      </svg>

      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted">
        <span>{formatUtcDate(trend[0].date)}</span>
        <span className="hidden sm:inline">{formatUtcDate(midDate)}</span>
        <span>{formatUtcDate(trend[trend.length - 1].date)}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span
          aria-hidden="true"
          className="h-0.5 w-5 rounded-full bg-navy-700"
        />
        <span>Incidents and near misses per day</span>
      </div>
    </div>
  );
}

export function ReportingTrend({
  trend,
  siteId = "",
}: {
  trend: HseTrendPoint[];
  siteId?: string;
}) {
  const summary = summariseTrend(trend);

  return (
    <Card>
      <CardHeader
        title="Incident reporting trend"
        description="Incidents and near misses by day in the selected period."
        action={
          <Link
            href={appendSiteFilter("/incidents", siteId)}
            className="text-xs font-semibold text-navy-700 hover:text-navy-900 hover:underline"
          >
            View reports
          </Link>
        }
      />
      <CardBody>
        {trend.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No reports occurred in this period.
          </p>
        ) : (
          <>
            <TrendLine trend={trend} />

            <dl className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Reports
                </dt>
                <dd className="tabular mt-1 text-lg font-semibold text-ink">
                  {summary.reports}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Reporting days
                </dt>
                <dd className="tabular mt-1 text-lg font-semibold text-ink">
                  {summary.reportingDays}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Peak day
                </dt>
                <dd className="mt-1 text-sm font-medium text-ink">
                  {summary.peak
                    ? `${summary.peak.count} on ${formatUtcDate(summary.peak.date)}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardBody>
    </Card>
  );
}
