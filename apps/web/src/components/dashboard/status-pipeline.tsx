import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { IncidentStatus } from "@/lib/api/types";

const SEGMENTS: {
  status: IncidentStatus;
  label: string;
  barClass: string;
  dotClass: string;
}[] = [
  {
    status: "REPORTED",
    label: "Reported",
    barClass: "bg-amber-500",
    dotClass: "bg-amber-500",
  },
  {
    status: "TRIAGED",
    label: "Triaged",
    barClass: "bg-navy-700",
    dotClass: "bg-navy-700",
  },
  {
    status: "CLOSED",
    label: "Closed",
    barClass: "bg-emerald-500",
    dotClass: "bg-emerald-500",
  },
];

export function StatusPipeline({
  byStatus,
}: {
  byStatus: Record<IncidentStatus, number>;
}) {
  const total = SEGMENTS.reduce(
    (sum, segment) => sum + byStatus[segment.status],
    0,
  );

  return (
    <Card>
      <CardHeader
        title="Status pipeline"
        description="Workflow position of reports in the selected scope."
      />
      <CardBody>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No reports in the current scope.
          </p>
        ) : (
          <>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-navy-100"
              role="img"
              aria-label={SEGMENTS.map(
                (segment) =>
                  `${segment.label}: ${byStatus[segment.status]}`,
              ).join(", ")}
            >
              {SEGMENTS.map((segment) => {
                const count = byStatus[segment.status];

                if (count === 0) {
                  return null;
                }

                return (
                  <div
                    key={segment.status}
                    className={segment.barClass}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                );
              })}
            </div>

            <ul className="mt-5 space-y-3">
              {SEGMENTS.map((segment) => {
                const count = byStatus[segment.status];

                return (
                  <li
                    key={segment.status}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="flex items-center gap-2 text-sm text-muted">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${segment.dotClass}`}
                      />
                      {segment.label}
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="tabular text-sm font-semibold text-ink">
                        {count}
                      </span>
                      <span className="tabular text-xs text-muted">
                        {Math.round((count / total) * 100)}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}
