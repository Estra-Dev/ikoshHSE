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
import { trainingDetailHref } from "@/lib/training";
import type { MyTrainingSession } from "@/lib/api/types";
import {
  AttendanceRecordStatusBadge,
  CertificateStateBadge,
  ParticipantAttendanceBadge,
} from "@/components/attendance-records/attendance-badges";

/**
 * Training history rows. The API returns only the requested person's
 * participation row, so other attendees are never part of this shape.
 */
export function TrainingHistoryTable({
  records,
  showLink = true,
}: {
  records: readonly MyTrainingSession[];
  showLink?: boolean;
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TH scope="col">Course / topic</TH>
          <TH scope="col">Scheduled</TH>
          <TH scope="col">Site</TH>
          <TH scope="col">Status</TH>
          <TH scope="col">Attendance</TH>
          <TH scope="col">Completion</TH>
          <TH scope="col">Certificate</TH>
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
                    href={trainingDetailHref(record.id)}
                    className="font-medium text-navy-900 underline-offset-2 hover:text-navy-700 hover:underline"
                  >
                    {record.course.title ?? record.topic}
                  </Link>
                ) : (
                  <span className="font-medium text-navy-900">
                    {record.course.title ?? record.topic}
                  </span>
                )}
                <div className="mt-1 text-xs text-muted">{record.topic}</div>
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
                {participation.completed ? "Recorded" : "Not recorded"}
              </TD>
              <TD>
                <div className="space-y-1">
                  <CertificateStateBadge state={participation.certificateState} />
                  {participation.certificateNumber && (
                    <p className="text-xs text-muted">
                      {participation.certificateNumber}
                    </p>
                  )}
                </div>
              </TD>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
