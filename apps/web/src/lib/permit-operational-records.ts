import type { IkoshRole, PermitStatus } from "./api/types";
import { canOperatePermits } from "./permissions";

/**
 * Pure helpers for append-only permit operational records.
 *
 * The server accepts exactly two record types on APPROVED, ACTIVE and
 * SUSPENDED permits and stamps the actor and timestamp itself. These helpers
 * keep the client payload limited to the writable fields and mirror the
 * server's newest-first ordering.
 */

export const PERMIT_OPERATIONAL_RECORD_TYPES = [
  "MONITORING_CHECK",
  "REVALIDATION",
] as const;

export type PermitOperationalRecordType =
  (typeof PERMIT_OPERATIONAL_RECORD_TYPES)[number];

export const PERMIT_OPERATIONAL_RECORD_TYPE_LABELS: Record<
  PermitOperationalRecordType,
  string
> = {
  MONITORING_CHECK: "Monitoring check",
  REVALIDATION: "Revalidation",
};

export const PERMIT_OPERATIONAL_RECORD_WRITABLE_STATUSES: readonly PermitStatus[] =
  ["APPROVED", "ACTIVE", "SUSPENDED"];

export const MAX_OPERATIONAL_RECORD_NOTES_LENGTH = 2000;
export const MAX_OPERATIONAL_RECORD_ATTACHMENTS = 20;

export interface PermitOperationalRecordPayloadInput {
  type: PermitOperationalRecordType;
  notes: string;
  attachmentIds?: readonly string[];
}

export interface PermitOperationalRecordPayload {
  type: PermitOperationalRecordType;
  notes: string;
  attachmentIds?: string[];
}

export function permitOperationalRecordLabel(
  type: PermitOperationalRecordType,
): string {
  return PERMIT_OPERATIONAL_RECORD_TYPE_LABELS[type];
}

/** Deduplicates trimmed ids and drops empty entries without reordering. */
function uniqueAttachmentIds(ids: readonly string[] | undefined): string[] {
  if (!ids) {
    return [];
  }

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of ids) {
    const id = raw.trim();

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    unique.push(id);
  }

  return unique;
}

/**
 * Builds the only payload the API accepts: type, trimmed notes and optional
 * attachment ids. Actor, timestamp and status fields are never copied.
 */
export function buildPermitOperationalRecordPayload(
  input: PermitOperationalRecordPayloadInput,
): PermitOperationalRecordPayload {
  const attachmentIds = uniqueAttachmentIds(input.attachmentIds);

  return {
    type: input.type,
    notes: input.notes.trim(),
    ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
  };
}

export function validatePermitOperationalRecordDraft(input: {
  type: PermitOperationalRecordType;
  notes: string;
  attachmentIds?: readonly string[];
}): string | null {
  if (!PERMIT_OPERATIONAL_RECORD_TYPES.includes(input.type)) {
    return "Choose a valid operational record type.";
  }

  if (!input.notes.trim()) {
    return "Notes are required for an operational record.";
  }

  if (input.notes.trim().length > MAX_OPERATIONAL_RECORD_NOTES_LENGTH) {
    return `Notes must be ${MAX_OPERATIONAL_RECORD_NOTES_LENGTH} characters or fewer.`;
  }

  if (
    uniqueAttachmentIds(input.attachmentIds).length >
    MAX_OPERATIONAL_RECORD_ATTACHMENTS
  ) {
    return `Select no more than ${MAX_OPERATIONAL_RECORD_ATTACHMENTS} attachments.`;
  }

  return null;
}

export function canRecordPermitOperationalRecord(
  role: IkoshRole | undefined,
  status: PermitStatus,
): boolean {
  return (
    canOperatePermits(role) &&
    PERMIT_OPERATIONAL_RECORD_WRITABLE_STATUSES.includes(status)
  );
}

/** Newest first, with a deterministic descending id tie-break. */
export function sortPermitOperationalRecords<
  T extends { id: string; recordedAt: string },
>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => {
    const byRecordedAt =
      new Date(right.recordedAt).getTime() -
      new Date(left.recordedAt).getTime();

    return byRecordedAt || right.id.localeCompare(left.id);
  });
}
