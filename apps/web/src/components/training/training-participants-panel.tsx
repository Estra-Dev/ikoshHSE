"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectField, TextField } from "@/components/ui/fields";
import { ParticipantPicker } from "@/components/participants/participant-picker";
import {
  ParticipantAttendanceBadge,
  ParticipantKindBadge,
} from "@/components/attendance-records/attendance-badges";
import { useUpdateTrainingParticipants } from "@/lib/api/training";
import type {
  ParticipantAttendanceState,
  TrainingSessionSummary,
} from "@/lib/api/types";
import {
  ATTENDANCE_STATE_LABELS,
  ATTENDANCE_RECORD_COMPLETION_HINT,
} from "@/lib/attendance-records";
import {
  createTrainingParticipantRow,
  trainingRowsFromServer,
  trainingRowsToInput,
  validateTrainingParticipantRows,
  type TrainingParticipantRow,
} from "@/lib/training";
import { formatUtcDateTime } from "@/lib/dashboard-format";

function CertificateSummary({ row }: { row: TrainingParticipantRow }) {
  if (!row.certificateNumber && !row.certificateIssuedOn) {
    return <span className="text-muted">Not recorded</span>;
  }

  return (
    <div className="space-y-0.5">
      {row.certificateNumber && (
        <p className="font-medium text-ink">{row.certificateNumber}</p>
      )}
      {row.certificateIssuedOn && (
        <p className="text-xs text-muted">
          Issued {formatUtcDateTime(row.certificateIssuedOn)}
        </p>
      )}
      {row.certificateExpiresOn && (
        <p className="text-xs text-muted">
          Expires {formatUtcDateTime(row.certificateExpiresOn)}
        </p>
      )}
    </div>
  );
}

/**
 * Attendance and certificate editor. It is only rendered while the session is
 * scheduled and the viewer may edit it; terminal sessions display immutable
 * evidence instead.
 */
export function TrainingParticipantsPanel({
  session,
  canEdit,
}: {
  session: TrainingSessionSummary;
  canEdit: boolean;
}) {
  const updateParticipants = useUpdateTrainingParticipants();
  const [rows, setRows] = useState<TrainingParticipantRow[]>(() =>
    trainingRowsFromServer(session.participants),
  );
  const [syncedVersion, setSyncedVersion] = useState(session.updatedAt);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (session.updatedAt !== syncedVersion) {
    setSyncedVersion(session.updatedAt);
    setRows(trainingRowsFromServer(session.participants));
  }

  function updateRow(
    key: string,
    updater: (row: TrainingParticipantRow) => TrainingParticipantRow,
  ): void {
    setRows((current) =>
      current.map((row) => (row.key === key ? updater(row) : row)),
    );
    setError("");
    setMessage("");
  }

  async function handleSave(): Promise<void> {
    setError("");
    setMessage("");

    const validationError = validateTrainingParticipantRows(rows);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await updateParticipants.mutateAsync({
        id: session.id,
        participants: trainingRowsToInput(rows),
      });
      setMessage("Attendance and certificate records saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The attendance records could not be saved.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Participants and certificates"
        description={ATTENDANCE_RECORD_COMPLETION_HINT}
        action={
          <Badge tone="neutral">
            {session.attendedCount}/{session.participantCount} attended
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {!canEdit && (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {session.status === "SCHEDULED"
              ? "Only the session author or HSE management can record attendance for this scheduled session."
              : "This session is terminal. Attendance and certificate records are immutable."}
          </p>
        )}

        {canEdit && (
          <>
            <ParticipantPicker
              siteId={session.site.id}
              exclude={rows.map((row) =>
                row.kind === "EMPLOYEE"
                  ? `employee:${row.employeeId}`
                  : `contractor:${row.contractorPersonnelId}`,
              )}
              onAdd={(picked) =>
                setRows((current) => [
                  ...current,
                  createTrainingParticipantRow(picked),
                ])
              }
            />

            {rows.length === 0 ? (
              <p className="text-sm text-muted">
                No participants recorded yet. Add at least one attendee before
                completion.
              </p>
            ) : (
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={row.key}
                    className="space-y-3 rounded-lg border border-line bg-navy-50/20 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ParticipantKindBadge kind={row.kind} />
                        <span className="text-sm font-semibold text-ink">
                          {row.name}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setRows((current) =>
                            current.filter((entry) => entry.key !== row.key),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <SelectField
                        label="Attendance"
                        id={`training-attendance-${row.key}`}
                        value={row.attendance}
                        onChange={(event) => {
                          const attendance = event.target
                            .value as ParticipantAttendanceState;
                          updateRow(row.key, (current) => ({
                            ...current,
                            attendance,
                            completed:
                              attendance === "ATTENDED"
                                ? current.completed
                                : false,
                          }));
                        }}
                        options={(
                          Object.keys(
                            ATTENDANCE_STATE_LABELS,
                          ) as ParticipantAttendanceState[]
                        ).map((state) => ({
                          value: state,
                          label: ATTENDANCE_STATE_LABELS[state],
                        }))}
                      />

                      <label className="flex items-end gap-2 pb-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={row.completed}
                          disabled={row.attendance !== "ATTENDED"}
                          onChange={(event) =>
                            updateRow(row.key, (current) => ({
                              ...current,
                              completed: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-line"
                        />
                        Completion recorded
                      </label>

                      <TextField
                        label="Certificate number"
                        id={`training-certificate-number-${row.key}`}
                        value={row.certificateNumber}
                        maxLength={120}
                        onChange={(event) =>
                          updateRow(row.key, (current) => ({
                            ...current,
                            certificateNumber: event.target.value,
                          }))
                        }
                      />

                      <TextField
                        label="Certificate issued"
                        id={`training-certificate-issued-${row.key}`}
                        type="date"
                        value={row.certificateIssuedOn}
                        onChange={(event) =>
                          updateRow(row.key, (current) => ({
                            ...current,
                            certificateIssuedOn: event.target.value,
                          }))
                        }
                      />

                      <TextField
                        label="Certificate expires"
                        id={`training-certificate-expires-${row.key}`}
                        type="date"
                        value={row.certificateExpiresOn}
                        onChange={(event) =>
                          updateRow(row.key, (current) => ({
                            ...current,
                            certificateExpiresOn: event.target.value,
                          }))
                        }
                      />

                      <TextField
                        label="Notes"
                        id={`training-participant-notes-${row.key}`}
                        value={row.notes}
                        maxLength={1000}
                        onChange={(event) =>
                          updateRow(row.key, (current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <p className="text-xs text-muted">
                      Attendee {index + 1}. Completion requires attendance and
                      records fact only, not competence.
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void handleSave()}
                isLoading={updateParticipants.isPending}
              >
                Save attendance
              </Button>
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
            </div>
          </>
        )}

        {!canEdit && session.participants.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Participant
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Attendance
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Completion
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Certificate
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ParticipantKindBadge kind={row.kind} />
                        <span className="font-medium text-ink">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ParticipantAttendanceBadge attendance={row.attendance} />
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {row.completed ? "Recorded" : "Not recorded"}
                    </td>
                    <td className="px-3 py-3">
                      <CertificateSummary row={row} />
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {row.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!canEdit && session.participants.length === 0 && (
          <p className="text-sm text-muted">
            No participants were recorded on this session.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
