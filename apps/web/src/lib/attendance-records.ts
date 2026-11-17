import type {
  AttendanceRecordStatus,
  CertificateState,
  ParticipantAttendanceState,
  WorkforceParticipantKind,
} from "./api/types";

/**
 * Client helpers shared by the training and toolbox talk workflows.
 *
 * These mirror the server lifecycle and labels for immediate feedback only.
 * The API remains authoritative for every transition and validation.
 */

export const ATTENDANCE_RECORD_TRANSITIONS: Record<
  AttendanceRecordStatus,
  readonly AttendanceRecordStatus[]
> = {
  SCHEDULED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function nextAttendanceStatuses(
  status: AttendanceRecordStatus,
): readonly AttendanceRecordStatus[] {
  return ATTENDANCE_RECORD_TRANSITIONS[status];
}

export function isAttendanceRecordTerminal(
  status: AttendanceRecordStatus,
): boolean {
  return ATTENDANCE_RECORD_TRANSITIONS[status].length === 0;
}

export function canTransitionAttendanceStatus(
  from: AttendanceRecordStatus,
  to: AttendanceRecordStatus,
): boolean {
  return ATTENDANCE_RECORD_TRANSITIONS[from].includes(to);
}

export const PARTICIPANT_KIND_LABELS: Record<
  WorkforceParticipantKind,
  string
> = {
  EMPLOYEE: "Employee",
  CONTRACTOR: "Contractor personnel",
};

export const ATTENDANCE_STATE_LABELS: Record<
  ParticipantAttendanceState,
  string
> = {
  INVITED: "Invited",
  ATTENDED: "Attended",
  ABSENT: "Absent",
};

export const CERTIFICATE_STATE_LABELS: Record<CertificateState, string> = {
  NOT_RECORDED: "Certificate not recorded",
  RECORDED: "Certificate recorded",
  VALID: "Certificate valid",
  EXPIRING_SOON: "Certificate expiring soon",
  EXPIRED: "Certificate expired",
};

/**
 * Badge tones for certificate state. Literal values match the shared badge
 * component without importing UI code into pure helpers.
 */
export const CERTIFICATE_STATE_TONES: Record<
  CertificateState,
  "neutral" | "green" | "amber" | "red"
> = {
  NOT_RECORDED: "neutral",
  RECORDED: "neutral",
  VALID: "green",
  EXPIRING_SOON: "amber",
  EXPIRED: "red",
};

/** A participant reference as submitted to the API. */
export interface ParticipantReference {
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
}

/**
 * Stable identity for duplicate detection. The workforce kind is part of the
 * key, so an employee id can never collide with a contractor personnel id.
 */
export function participantIdentity(
  participant: ParticipantReference,
): string | null {
  if (participant.kind === "EMPLOYEE") {
    return participant.employeeId
      ? `employee:${participant.employeeId}`
      : null;
  }

  return participant.contractorPersonnelId
    ? `contractor:${participant.contractorPersonnelId}`
    : null;
}

/**
 * Returns the index of the first duplicated participant, or `null` when every
 * reference is unique. Incomplete rows are ignored because the form validates
 * them separately.
 */
export function findDuplicateParticipantIndex(
  participants: readonly ParticipantReference[],
): number | null {
  const seen = new Set<string>();

  for (const [index, participant] of participants.entries()) {
    const identity = participantIdentity(participant);

    if (!identity) {
      continue;
    }

    if (seen.has(identity)) {
      return index;
    }

    seen.add(identity);
  }

  return null;
}

/** Factual completion wording used across both modules. */
export const ATTENDANCE_RECORD_COMPLETION_HINT =
  "Completion records attendance only. It does not assert competence or authorisation.";
