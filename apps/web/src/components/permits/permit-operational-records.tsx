"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { SelectField, TextareaField } from "@/components/ui/fields";
import { Pagination } from "@/components/ui/pagination";
import { DownloadIcon } from "@/components/icons";
import {
  useAttachmentBlob,
  useEntityAttachments,
} from "@/lib/api/attachments";
import {
  PERMIT_OPERATIONAL_RECORDS_PAGE_SIZE,
  useCreatePermitOperationalRecord,
  usePermitOperationalRecords,
} from "@/lib/api/permits";
import type {
  IkoshRole,
  PermitOperationalRecord,
  PermitOperationalRecordType,
  PermitStatus,
} from "@/lib/api/types";
import { downloadBlob, formatAttachmentSize } from "@/lib/attachments";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  buildPermitOperationalRecordPayload,
  canRecordPermitOperationalRecord,
  PERMIT_OPERATIONAL_RECORD_TYPE_LABELS,
  PERMIT_OPERATIONAL_RECORD_TYPES,
  permitOperationalRecordLabel,
  sortPermitOperationalRecords,
  validatePermitOperationalRecordDraft,
} from "@/lib/permit-operational-records";

interface PermitOperationalRecordsProps {
  permitId: string;
  permitStatus: PermitStatus;
  role: IkoshRole | undefined;
}

function personName(person: { firstName: string; lastName: string }): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unknown employee";
}

function typeTone(type: PermitOperationalRecordType) {
  return type === "MONITORING_CHECK" ? "blue" : "violet";
}

/**
 * Authenticated attachment download. The endpoint requires a token, so bytes
 * are fetched on demand and saved from an object URL.
 */
function RecordAttachmentLink({
  attachmentId,
  filename,
}: {
  attachmentId: string;
  filename: string;
}) {
  const blobQuery = useAttachmentBlob(attachmentId, false);

  async function handleDownload(): Promise<void> {
    const result = await blobQuery.refetch();

    if (result.data) {
      downloadBlob(result.data, filename);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={blobQuery.isFetching}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-navy-700 transition hover:border-navy-200 hover:bg-navy-50 disabled:opacity-60"
    >
      <DownloadIcon size={13} />
      {filename}
    </button>
  );
}

function TimelineItem({
  record,
  attachments,
}: {
  record: PermitOperationalRecord;
  attachments: ReadonlyMap<string, { originalFilename: string }>;
}) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={typeTone(record.type)} dot>
            {permitOperationalRecordLabel(record.type)}
          </Badge>
          <span className="text-xs text-muted">
            {record.recordedBy ? personName(record.recordedBy) : "Unknown employee"}{" "}
            · {formatUtcDateTime(record.recordedAt)}
          </span>
        </div>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
        {record.notes}
      </p>

      {record.attachmentIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {record.attachmentIds.map((attachmentId) => {
            const attachment = attachments.get(attachmentId);

            return (
              <RecordAttachmentLink
                key={attachmentId}
                attachmentId={attachmentId}
                filename={attachment?.originalFilename ?? "Attachment"}
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

/**
 * Append-only operational evidence. Forms are visible only for permitted
 * operators on APPROVED, ACTIVE or SUSPENDED permits; history stays readable
 * in every state. The API remains authoritative for status, scope and actor.
 */
export function PermitOperationalRecords({
  permitId,
  permitStatus,
  role,
}: PermitOperationalRecordsProps) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<PermitOperationalRecordType>("MONITORING_CHECK");
  const [notes, setNotes] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const recordsQuery = usePermitOperationalRecords(permitId, page);
  const attachmentsQuery = useEntityAttachments("permit", permitId);
  const createRecord = useCreatePermitOperationalRecord(permitId);

  const canRecord = canRecordPermitOperationalRecord(role, permitStatus);

  const attachmentMap = useMemo(() => {
    const map = new Map<string, { originalFilename: string }>();

    for (const attachment of attachmentsQuery.data?.attachments ?? []) {
      map.set(attachment.id, attachment);
    }

    return map;
  }, [attachmentsQuery.data]);

  const records = sortPermitOperationalRecords(
    recordsQuery.data?.records ?? [],
  );

  function toggleAttachment(id: string): void {
    setAttachmentIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function resetForm(): void {
    setType("MONITORING_CHECK");
    setNotes("");
    setAttachmentIds([]);
  }

  async function handleSubmit(): Promise<void> {
    setError("");
    setMessage("");

    const validationError = validatePermitOperationalRecordDraft({
      type,
      notes,
      attachmentIds,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await createRecord.mutateAsync(
        buildPermitOperationalRecordPayload({ type, notes, attachmentIds }),
      );
      resetForm();
      setPage(1);
      setMessage(`${permitOperationalRecordLabel(type)} recorded.`);
    } catch (recordError) {
      setError(
        recordError instanceof Error
          ? recordError.message
          : "The operational record could not be saved.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Operational records"
        description="Append-only monitoring checks and revalidations recorded while work is approved, active or suspended."
      />
      <CardBody className="space-y-5">
        {recordsQuery.isLoading && <Spinner label="Loading operational records..." />}

        {recordsQuery.isError && (
          <ErrorState
            title="Unable to load operational records"
            message={
              recordsQuery.error instanceof Error
                ? recordsQuery.error.message
                : "Please try again."
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void recordsQuery.refetch()}
                isLoading={recordsQuery.isFetching}
              >
                Try again
              </Button>
            }
          />
        )}

        {!recordsQuery.isLoading && !recordsQuery.isError && records.length === 0 && (
          <EmptyState
            title="No operational records yet"
            description={
              canRecord
                ? "Record a monitoring check or revalidation below."
                : "Monitoring checks and revalidations appear here once they are recorded."
            }
          />
        )}

        {records.length > 0 && (
          <>
            <ul className="divide-y divide-line">
              {records.map((record) => (
                <TimelineItem
                  key={record.id}
                  record={record}
                  attachments={attachmentMap}
                />
              ))}
            </ul>

            {recordsQuery.data && (
              <Pagination
                page={recordsQuery.data.pagination.page}
                totalPages={recordsQuery.data.pagination.totalPages}
                total={recordsQuery.data.pagination.total}
                limit={PERMIT_OPERATIONAL_RECORDS_PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </>
        )}

        {canRecord ? (
          <div className="space-y-4 rounded-lg border border-line bg-navy-50/30 p-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Record operational evidence
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted">
                This appends a new record. It never changes the permit status,
                approvals or readiness preview.
              </p>
            </div>

            <SelectField
              label="Record type"
              id="operational-record-type"
              value={type}
              onChange={(event) =>
                setType(event.target.value as PermitOperationalRecordType)
              }
              options={PERMIT_OPERATIONAL_RECORD_TYPES.map((value) => ({
                value,
                label: PERMIT_OPERATIONAL_RECORD_TYPE_LABELS[value],
              }))}
            />

            <TextareaField
              label="Notes (required)"
              id="operational-record-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What was checked or revalidated, and by whom on site."
            />

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Attach permit evidence (optional)
              </legend>
              {attachmentsQuery.isLoading && (
                <p className="text-xs text-muted">Loading evidence...</p>
              )}
              {!attachmentsQuery.isLoading &&
                (attachmentsQuery.data?.attachments.length ?? 0) === 0 && (
                  <p className="text-xs text-muted">
                    No permit evidence is available yet. Upload it in the
                    Permit evidence panel first.
                  </p>
                )}
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {(attachmentsQuery.data?.attachments ?? []).map((attachment) => (
                  <label
                    key={attachment.id}
                    className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={attachmentIds.includes(attachment.id)}
                      onChange={() => toggleAttachment(attachment.id)}
                      className="mt-0.5 h-4 w-4 rounded border-line text-navy-700 focus:ring-navy-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate">
                        {attachment.originalFilename}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatAttachmentSize(attachment.size)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Button
              onClick={() => void handleSubmit()}
              isLoading={createRecord.isPending}
            >
              Append {permitOperationalRecordLabel(type).toLowerCase()}
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {permitStatus === "APPROVED" ||
            permitStatus === "ACTIVE" ||
            permitStatus === "SUSPENDED"
              ? "Your role can view these records but cannot append operational evidence."
              : "Operational evidence can only be recorded on approved, active or suspended permits."}
          </p>
        )}

        {message && (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
