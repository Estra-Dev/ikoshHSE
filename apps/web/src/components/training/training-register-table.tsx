import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import type { TrainingSessionSummary } from "@/lib/api/types";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { trainingDetailHref } from "@/lib/training";
import { AttendanceRecordStatusBadge } from "@/components/attendance-records/attendance-badges";

/** Training register rows link to the site-scoped session detail. */
export function TrainingRegisterTable({
  sessions,
}: {
  sessions: readonly TrainingSessionSummary[];
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Session</TH>
          <TH scope="col">Trainer</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Scheduled</TH>
          <TH scope="col">Attendance</TH>
          <TH scope="col">Status</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {sessions.map((session) => (
          <TableRow key={session.id}>
            <TD className="max-w-md">
              <Link
                href={trainingDetailHref(session.id)}
                className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
              >
                {session.course.title ?? session.topic}
              </Link>
              <div className="mt-1 text-xs text-muted">
                {session.topic}
                {session.course.code ? ` · ${session.course.code}` : ""}
              </div>
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {session.trainerName}
            </TD>
            <TD className="text-muted">
              {session.site.name ?? session.project.name ?? "—"}
            </TD>
            <TD className="whitespace-nowrap text-muted">
              {formatUtcDateTime(session.scheduledDate)}
            </TD>
            <TD className="text-muted">
              {session.attendedCount}/{session.participantCount} attended
              <div className="text-xs text-muted">
                {session.completedCount} completed
              </div>
            </TD>
            <TD>
              <AttendanceRecordStatusBadge status={session.status} />
            </TD>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
