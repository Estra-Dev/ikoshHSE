import {
  ATTENDANCE_RECORD_STATUSES,
  type AttendanceRecordStatus,
  type ParticipantAttendanceState,
  type ToolboxTalkParticipant,
  type ToolboxTalkParticipantInput,
  type WorkforceParticipantKind,
} from "./api/types";
import { findDuplicateParticipantIndex } from "./attendance-records";

/**
 * Pure URL-state helpers for the toolbox talk register.
 *
 * Filter state lives in the query string so a filtered register is shareable.
 * The API remains authoritative for site scoping, attendance, acknowledgements
 * and terminal transitions.
 */

export const TOOLBOX_TALK_PAGE_SIZE = 20;
export const MAX_TOOLBOX_TALK_PAGE_SIZE = 100;
export const MAX_TOOLBOX_TALK_SEARCH_LENGTH = 200;

export interface ToolboxTalkFilterState {
  q: string;
  status: AttendanceRecordStatus | "";
  projectId: string;
  siteId: string;
  from: string;
  to: string;
  page: number;
  limit: number;
}

export const EMPTY_TOOLBOX_TALK_FILTERS: ToolboxTalkFilterState = {
  q: "",
  status: "",
  projectId: "",
  siteId: "",
  from: "",
  to: "",
  page: 1,
  limit: TOOLBOX_TALK_PAGE_SIZE,
};

export function toolboxTalkDetailHref(talkId: string): string {
  return `/toolbox-talks/${talkId}`;
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
export function parseToolboxTalkFilters(
  searchParams: URLSearchParams,
): ToolboxTalkFilterState {
  const rawStatus = searchParams.get("status");
  const rawQuery = (searchParams.get("q") ?? "").trim();
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Number.parseInt(
    searchParams.get("limit") ?? String(TOOLBOX_TALK_PAGE_SIZE),
    10,
  );

  return {
    q: rawQuery.slice(0, MAX_TOOLBOX_TALK_SEARCH_LENGTH),
    status: isAttendanceRecordStatus(rawStatus) ? rawStatus : "",
    projectId: objectIdOrEmpty(searchParams.get("projectId")),
    siteId: objectIdOrEmpty(searchParams.get("siteId")),
    from: dateInputOrEmpty(searchParams.get("from")),
    to: dateInputOrEmpty(searchParams.get("to")),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit:
      Number.isFinite(limit) &&
      limit >= 1 &&
      limit <= MAX_TOOLBOX_TALK_PAGE_SIZE
        ? limit
        : TOOLBOX_TALK_PAGE_SIZE,
  };
}

/** Builds shareable URL state, omitting defaults. */
export function buildToolboxTalkFilterSearchParams(
  filters: ToolboxTalkFilterState,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.q) searchParams.set("q", filters.q);
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.projectId) searchParams.set("projectId", filters.projectId);
  if (filters.siteId) searchParams.set("siteId", filters.siteId);
  if (filters.from) searchParams.set("from", filters.from);
  if (filters.to) searchParams.set("to", filters.to);
  if (filters.page > 1) searchParams.set("page", String(filters.page));
  if (filters.limit !== TOOLBOX_TALK_PAGE_SIZE) {
    searchParams.set("limit", String(filters.limit));
  }

  return searchParams;
}

/** Whether any user-adjustable filter (not paging) is active. */
export function hasActiveToolboxTalkFilters(
  filters: ToolboxTalkFilterState,
): boolean {
  return Boolean(
    filters.q ||
      filters.status ||
      filters.projectId ||
      filters.siteId ||
      filters.from ||
      filters.to,
  );
}

/* -------------------------------------------------------------------------- */
/* Attendee draft rows                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Editable attendee row used by the scheduling form and acknowledgement
 * editor. Acknowledgement is evidence that the person confirmed the briefing;
 * it is never a competency claim.
 */
export interface ToolboxTalkParticipantRow {
  key: string;
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
  name: string;
  attendance: ParticipantAttendanceState;
  acknowledged: boolean;
  notes: string;
}

let participantKeySeed = 0;

function nextParticipantKey(): string {
  participantKeySeed += 1;
  return `toolbox-participant-${Date.now()}-${participantKeySeed}`;
}

export function createToolboxTalkParticipantRow(picked: {
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
  name: string;
}): ToolboxTalkParticipantRow {
  return {
    key: nextParticipantKey(),
    kind: picked.kind,
    employeeId: picked.employeeId,
    contractorPersonnelId: picked.contractorPersonnelId,
    name: picked.name,
    attendance: "INVITED",
    acknowledged: false,
    notes: "",
  };
}

export function toolboxTalkRowsFromServer(
  participants: readonly ToolboxTalkParticipant[],
): ToolboxTalkParticipantRow[] {
  return participants.map((participant) => ({
    key: nextParticipantKey(),
    kind: participant.kind,
    employeeId: participant.employeeId ?? undefined,
    contractorPersonnelId: participant.contractorPersonnelId ?? undefined,
    name: participant.name,
    attendance: participant.attendance,
    acknowledged: participant.acknowledged,
    notes: participant.notes ?? "",
  }));
}

export function toolboxTalkRowsToInput(
  rows: readonly ToolboxTalkParticipantRow[],
): ToolboxTalkParticipantInput[] {
  return rows.map((row) => ({
    kind: row.kind,
    employeeId: row.kind === "EMPLOYEE" ? row.employeeId : undefined,
    contractorPersonnelId:
      row.kind === "CONTRACTOR" ? row.contractorPersonnelId : undefined,
    attendance: row.attendance,
    acknowledged: row.acknowledged,
    notes: row.notes.trim() || undefined,
  }));
}

/**
 * Mirrors the API rules for acknowledgement evidence so the form fails fast.
 * The server still validates every row and every workforce reference.
 */
export function validateToolboxTalkParticipantRows(
  rows: readonly ToolboxTalkParticipantRow[],
): string | null {
  const duplicateIndex = findDuplicateParticipantIndex(
    rows.map((row) => ({
      kind: row.kind,
      employeeId: row.employeeId,
      contractorPersonnelId: row.contractorPersonnelId,
    })),
  );

  if (duplicateIndex !== null) {
    return "Each person may appear only once on a toolbox talk.";
  }

  for (const [index, row] of rows.entries()) {
    const position = index + 1;
    const identity =
      row.kind === "EMPLOYEE" ? row.employeeId : row.contractorPersonnelId;

    if (!identity) {
      return `Attendee ${position} has no selected person.`;
    }

    if (row.acknowledged && row.attendance !== "ATTENDED") {
      return `Attendee ${position} must be marked attended before acknowledgement can be recorded.`;
    }
  }

  return null;
}
