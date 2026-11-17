import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { CorrectiveActionSummary } from "@/lib/api/types";
import {
  correctiveActionDetailHref,
  isCorrectiveActionOverdue,
} from "@/lib/corrective-actions";
import { formatUtcDate } from "@/lib/dashboard-format";
import {
  CorrectiveActionSourceBadge,
  CorrectiveActionStatusBadge,
  OverdueBadge,
} from "./corrective-action-badges";

function assigneeName(action: CorrectiveActionSummary): string {
  const name = `${action.assignedTo.firstName} ${action.assignedTo.lastName}`.trim();
  return name || "Unassigned";
}

/**
 * Register rows link to the action detail. Project/site names come from the
 * populated action payload; no additional lookups are required.
 */
export function CorrectiveActionRegisterTable({
  actions,
}: {
  actions: readonly CorrectiveActionSummary[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Action</TH>
          <TH scope="col">Assignee</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Due</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {actions.map((action) => (
          <TableRow key={action.id}>
            <TD className="max-w-md">
              <Link
                href={correctiveActionDetailHref(action.id)}
                className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
              >
                {action.description}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <CorrectiveActionSourceBadge source={action.source} />
                <span className="text-xs text-muted">{action.project.name}</span>
              </div>
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {assigneeName(action)}
            </TD>
            <TD className="text-muted">
              {action.site?.name ?? "No site"}
            </TD>
            <TD className="whitespace-nowrap text-muted">
              <div className="flex flex-wrap items-center gap-2">
                {formatUtcDate(action.dueDate)}
                {isCorrectiveActionOverdue(action) && <OverdueBadge />}
              </div>
            </TD>
            <TD>
              <CorrectiveActionStatusBadge status={action.status} />
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
