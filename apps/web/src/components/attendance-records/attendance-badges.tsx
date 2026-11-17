import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";
import type {
  AttendanceRecordStatus,
  CertificateState,
  ParticipantAttendanceState,
  WorkforceParticipantKind,
} from "@/lib/api/types";
import {
  ATTENDANCE_STATE_LABELS,
  CERTIFICATE_STATE_LABELS,
  CERTIFICATE_STATE_TONES,
  PARTICIPANT_KIND_LABELS,
} from "@/lib/attendance-records";

const RECORD_STATUS_TONES: Record<AttendanceRecordStatus, BadgeTone> = {
  SCHEDULED: "blue",
  COMPLETED: "green",
  CANCELLED: "neutral",
};

const ATTENDANCE_TONES: Record<ParticipantAttendanceState, BadgeTone> = {
  INVITED: "neutral",
  ATTENDED: "green",
  ABSENT: "red",
};

const PARTICIPANT_KIND_TONES: Record<WorkforceParticipantKind, BadgeTone> = {
  EMPLOYEE: "navy",
  CONTRACTOR: "violet",
};

export function AttendanceRecordStatusBadge({
  status,
}: {
  status: AttendanceRecordStatus;
}) {
  return (
    <Badge tone={RECORD_STATUS_TONES[status]} dot>
      {formatHseLabel(status)}
    </Badge>
  );
}

export function ParticipantAttendanceBadge({
  attendance,
}: {
  attendance: ParticipantAttendanceState;
}) {
  return (
    <Badge tone={ATTENDANCE_TONES[attendance]}>
      {ATTENDANCE_STATE_LABELS[attendance]}
    </Badge>
  );
}

export function ParticipantKindBadge({
  kind,
}: {
  kind: WorkforceParticipantKind;
}) {
  return (
    <Badge tone={PARTICIPANT_KIND_TONES[kind]}>
      {PARTICIPANT_KIND_LABELS[kind]}
    </Badge>
  );
}

export function CertificateStateBadge({
  state,
}: {
  state: CertificateState;
}) {
  return (
    <Badge tone={CERTIFICATE_STATE_TONES[state]}>
      {CERTIFICATE_STATE_LABELS[state]}
    </Badge>
  );
}
