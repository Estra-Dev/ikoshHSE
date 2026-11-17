import Link from "next/link";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import { toolboxTalkDetailHref } from "@/lib/toolbox-talks";
import type { MyToolboxTalk } from "@/lib/api/types";
import {
  AttendanceRecordStatusBadge,
  ParticipantAttendanceBadge,
} from "@/components/attendance-records/attendance-badges";

/**
 * Toolbox talk history rows. The API returns only the requested person's
 * participation row, so other attendees are never part of this shape.
 */
export function ToolboxTalkHistoryTable({
  records,
  showLink = true,
}: {
  records: readonly MyToolboxTalk[];
  showLink?: boolean;
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Topic</TH>
          <TH scope="col">Scheduled</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Status</TH>
          <TH scope="col">Attendance</TH>
          <TH scope="col">Acknowledged</TH>
        </TableRow>
      </TableHead>
      <TableBody>
        {records.map((record) => {
          const participation = record.participation;

          return (
            <TableRow key={record.id}>
              <TD className="max-w-md">
                {showLink ? (
                  <Link
                    href={toolboxTalkDetailHref(record.id)}
                    className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
                  >
                    {record.topic}
                  </Link>
                ) : (
                  <span className="font-medium text-navy-900">
                    {record.topic}
                  </span>
                )}
                <div className="mt-1 text-xs text-muted">
                  Facilitator: {record.facilitatorName}
                </div>
              </TD>
              <TD className="whitespace-nowrap text-muted">
                {formatUtcDateTime(record.scheduledDate)}
              </TD>
              <TD className="text-muted">
                {record.site.name ?? record.project.name ?? "—"}
              </TD>
              <TD>
                <AttendanceRecordStatusBadge status={record.status} />
              </TD>
              <TD>
                <ParticipantAttendanceBadge
                  attendance={participation.attendance}
                />
              </TD>
              <TD className="text-muted">
                {participation.acknowledged ? "Acknowledged" : "Not acknowledged"}
              </TD>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
