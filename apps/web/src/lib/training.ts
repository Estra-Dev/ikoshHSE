import {
  ATTENDANCE_RECORD_STATUSES,
  TRAINING_COURSE_CATEGORIES,
  type AttendanceRecordStatus,
  type ParticipantAttendanceState,
  type TrainingCourseCategory,
  type TrainingParticipant,
  type TrainingParticipantInput,
  type WorkforceParticipantKind,
} from "./api/types";
import { findDuplicateParticipantIndex } from "./attendance-records";

/**
 * Pure URL-state helpers for the training register.
 *
 * Filter state lives in the query string so a filtered register is shareable.
 * The API remains authoritative for site scoping, participants, transitions
 * and certificate validation.
 */

export const TRAINING_PAGE_SIZE = 20;
export const MAX_TRAINING_PAGE_SIZE = 100;
export const MAX_TRAINING_SEARCH_LENGTH = 200;

export interface TrainingFilterState {
  q: string;
  status: AttendanceRecordStatus | "";
  courseId: string;
  projectId: string;
  siteId: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}

export const EMPTY_TRAINING_FILTERS: TrainingFilterState = {
  q: "",
  status: "",
  courseId: "",
  projectId: "",
  siteId: "",
  from: "",
  to: "",
  page: 1,
  limit: TRAINING_PAGE_SIZE,
};

export function trainingDetailHref(sessionId: string): string {
  return `/training/${sessionId}`;
}

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isAttendanceRecordStatus(
  value: unknown,
): value is AttendanceRecordStatus {
  return (
    typeof value === "string" &&
    (ATTENDANCE_RECORD_STATUSES as readonly string[]).includes(value)
  );
}

function objectIdOrEmpty(value: string | null): string {
  return value !== null && OBJECT_ID_PATTERN.test(value) ? value : "";
}

function dateInputOrEmpty(value: string | null): string {
  return value !== null && DATE_INPUT_PATTERN.test(value) ? value : "";
}

/** Parses register filters, falling back safely for malformed URL values. */
export function parseTrainingFilters(
  searchParams: URLSearchParams,
): TrainingFilterState {
  const rawStatus = searchParams.get("status");
  const rawQuery = (searchParams.get("q") ?? "").trim();
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(TRAINING_PAGE_SIZE),
    10,
  );

  return {
    q: rawQuery.slice(0, MAX_TRAINING_SEARCH_LENGTH),
    status: isAttendanceRecordStatus(rawStatus) ? rawStatus : "",
    courseId: objectIdOrEmpty(searchParams.get("courseId")),
    projectId: objectIdOrEmpty(searchParams.get("projectId")),
    siteId: objectIdOrEmpty(searchParams.get("siteId")),
    from: dateInputOrEmpty(searchParams.get("from")),
    to: dateInputOrEmpty(searchParams.get("to")),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) &&
      limit >= 1 &&
      limit <= MAX_TRAINING_PAGE_SIZE
        ? limit
        : TRAINING_PAGE_SIZE,
  };
}

/** Builds shareable URL state, omitting defaults. */
export function buildTrainingFilterSearchParams(
  filters: TrainingFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q) searchParams.set("q", filters.q);
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.courseId) searchParams.set("courseId", filters.courseId);
  if (filters.projectId) searchParams.set("projectId", filters.projectId);
  if (filters.siteId) searchParams.set("siteId", filters.siteId);
  if (filters.from) searchParams.set("from", filters.from);
  if (filters.to) searchParams.set("to", filters.to);
  if (filters.page > 1) searchParams.set("page", String(filters.page));
  if (filters.limit !== TRAINING_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActiveTrainingFilters(filters: TrainingFilterState): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.courseId ||
      filters.projectId ||
      filters.siteId ||
      filters.from ||
      filters.to,
  );
}

export function isTrainingCourseCategory(
  value: unknown,
): value is TrainingCourseCategory {
  return (
    typeof value === "string" &&
    (TRAINING_COURSE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Converts a browser datetime-local or date value into the ISO string the API
 * validates. Returns an empty string when the input is not a valid date.
 */
export function toScheduledDateIso(value: string): string {
  if (!value.trim()) {
    return "";
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

/** Formats an ISO date for a `datetime-local` input without timezone drift. */
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/* Participant draft rows                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Editable participant row used by the schedule form and attendance editor.
 * Certificate dates are held as `yyyy-mm-dd` input values and normalized on
 * submit. Completion is factual attendance, never a competence claim.
 */
export interface TrainingParticipantRow {
  key: string;
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
  name: string;
  attendance: ParticipantAttendanceState;
  completed: boolean;
  certificateNumber: string;
  certificateIssuedOn: string;
  certificateExpiresOn: string;
  notes: string;
}

let participantKeySeed = 0;

function nextParticipantKey(): string {
  participantKeySeed += 1;
  return `training-participant-${Date.now()}-${participantKeySeed}`;
}

export function createTrainingParticipantRow(picked: {
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
  name: string;
}): TrainingParticipantRow {
  return {
    key: nextParticipantKey(),
    kind: picked.kind,
    employeeId: picked.employeeId,
    contractorPersonnelId: picked.contractorPersonnelId,
    name: picked.name,
    attendance: "INVITED",
    completed: false,
    certificateNumber: "",
    certificateIssuedOn: "",
    certificateExpiresOn: "",
    notes: "",
  };
}

/** Formats an ISO timestamp as a `yyyy-mm-dd` date input value. */
export function toDateInputValue(iso: string | null): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function trainingRowsFromServer(
  participants: readonly TrainingParticipant[],
): TrainingParticipantRow[] {
  return participants.map((participant) => ({
    key: nextParticipantKey(),
    kind: participant.kind,
    employeeId: participant.employeeId ?? undefined,
    contractorPersonnelId: participant.contractorPersonnelId ?? undefined,
    name: participant.name,
    attendance: participant.attendance,
    completed: participant.completed,
    certificateNumber: participant.certificateNumber ?? "",
    certificateIssuedOn: toDateInputValue(participant.certificateIssuedOn),
    certificateExpiresOn: toDateInputValue(participant.certificateExpiresOn),
    notes: participant.notes ?? "",
  }));
}

function dateInputToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function trainingRowsToInput(
  rows: readonly TrainingParticipantRow[],
): TrainingParticipantInput[] {
  return rows.map((row) => ({
    kind: row.kind,
    employeeId: row.kind === "EMPLOYEE" ? row.employeeId : undefined,
    contractorPersonnelId:
      row.kind === "CONTRACTOR" ? row.contractorPersonnelId : undefined,
    attendance: row.attendance,
    completed: row.completed,
    certificateNumber: row.certificateNumber.trim() || undefined,
    certificateIssuedOn: dateInputToIso(row.certificateIssuedOn),
    certificateExpiresOn: dateInputToIso(row.certificateExpiresOn),
    notes: row.notes.trim() || undefined,
  }));
}

/**
 * Mirrors the API's participant rules so the form can fail fast. The server
 * still validates every row and every reference.
 */
export function validateTrainingParticipantRows(
  rows: readonly TrainingParticipantRow[],
): string | null {
  const duplicateIndex = findDuplicateParticipantIndex(
    rows.map((row) => ({
      kind: row.kind,
      employeeId: row.employeeId,
      contractorPersonnelId: row.contractorPersonnelId,
    })),
  );

  if (duplicateIndex !== null) {
    return "Each person may appear only once on a training session.";
  }

  for (const [index, row] of rows.entries()) {
    const position = index + 1;
    const identity =
      row.kind === "EMPLOYEE" ? row.employeeId : row.contractorPersonnelId;

    if (!identity) {
      return `Attendee ${position} has no selected person.`;
    }

    if (row.completed && row.attendance !== "ATTENDED") {
      return `Attendee ${position} must be marked attended before completion can be recorded.`;
    }

    if (row.certificateNumber.trim() && !row.certificateIssuedOn) {
      return `Attendee ${position} needs a certificate issue date with a certificate number.`;
    }

    if (row.certificateExpiresOn && !row.certificateIssuedOn) {
      return `Attendee ${position} needs a certificate issue date before an expiry date.`;
    }

    if (
      row.certificateIssuedOn &&
      row.certificateExpiresOn &&
      row.certificateExpiresOn < row.certificateIssuedOn
    ) {
      return `Attendee ${position} has a certificate expiry before its issue date.`;
    }
  }

  return null;
}
