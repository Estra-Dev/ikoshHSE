import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { HseDashboard } from "@/lib/api/types";

function QueueRow({
  label,
  count,
  description,
  tone,
}: {
  label: string;
  count: number;
  description: string;
  tone: "amber" | "red" | "navy";
}) {
  const toneClass = {
    amber: "bg-amber-500",
    red: "bg-red-500",
    navy: "bg-navy-700",
  }[tone];

  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneClass}`}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>
        </div>
      </div>
      <p className="tabular text-lg font-semibold text-ink">{count}</p>
    </div>
  );
}

export function OutstandingQueues({ dashboard }: { dashboard: HseDashboard }) {
  const { byStatus, unclassified } = dashboard.incidents;
  const total = unclassified + byStatus.REPORTED + byStatus.TRIAGED;

  return (
    <Card>
      <CardHeader
        title="Outstanding HSE activities"
        description="Reports that still need an HSE workflow decision."
      />
      <CardBody>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No outstanding reports in the current scope.
          </p>
        ) : (
          <div className="divide-y divide-line">
            <QueueRow
              label="Unclassified"
              count={unclassified}
              description="Reports awaiting HSE classification."
              tone="amber"
            />
            <QueueRow
              label="Awaiting triage"
              count={byStatus.REPORTED}
              description="New reports still in REPORTED status."
              tone="red"
            />
            <QueueRow
              label="Awaiting closure"
              count={byStatus.TRIAGED}
              description="Triaged reports that remain open."
              tone="navy"
            />
          </div>
        )}

        <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted">
          Queues can overlap: a report may be unclassified and still awaiting
          triage.
        </p>
      </CardBody>
    </Card>
  );
}
