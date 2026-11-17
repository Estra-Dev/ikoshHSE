import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { ToolboxTalkSummary } from "@/lib/api/types";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { toolboxTalkDetailHref } from "@/lib/toolbox-talks";
import { AttendanceRecordStatusBadge } from "@/components/attendance-records/attendance-badges";

/** Toolbox talk register rows link to the site-scoped talk detail. */
export function ToolboxTalkRegisterTable({
  talks,
}: {
  talks: readonly ToolboxTalkSummary[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Talk</TH>
          <TH scope="col">Facilitator</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Scheduled</TH>
          <TH scope="col">Attendance</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {talks.map((talk) => (
          <TableRow key={talk.id}>
            <TD className="max-w-md">
              <Link
                href={toolboxTalkDetailHref(talk.id)}
                className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
              >
                {talk.topic}
              </Link>
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {talk.facilitatorName}
            </TD>
            <TD className="text-muted">
              {talk.site.name ?? talk.project.name ?? "—"}
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {formatUtcDateTime(talk.scheduledDate)}
            </TD>
            <TD className="text-muted">
              {talk.attendedCount}/{talk.participantCount} attended
              <div className="text-xs text-muted">
                {talk.acknowledgedCount} acknowledged
              </div>
            </TD>
            <TD>
              <AttendanceRecordStatusBadge status={talk.status} />
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
