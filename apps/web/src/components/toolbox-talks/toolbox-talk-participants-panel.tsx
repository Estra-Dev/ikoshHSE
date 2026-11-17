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
import { useUpdateToolboxTalkParticipants } from "@/lib/api/toolbox-talks";
import type {
  ParticipantAttendanceState,
  ToolboxTalkSummary,
} from "@/lib/api/types";
import {
  ATTENDANCE_STATE_LABELS,
  ATTENDANCE_RECORD_COMPLETION_HINT,
} from "@/lib/attendance-records";
import {
  createToolboxTalkParticipantRow,
  toolboxTalkRowsFromServer,
  toolboxTalkRowsToInput,
  validateToolboxTalkParticipantRows,
  type ToolboxTalkParticipantRow,
} from "@/lib/toolbox-talks";

/**
 * Attendance and acknowledgement editor. It is only rendered while the talk is
 * scheduled and the viewer may edit it; terminal talks display immutable
 * evidence instead.
 */
export function ToolboxTalkParticipantsPanel({
  talk,
  canEdit,
}: {
  talk: ToolboxTalkSummary;
  canEdit: boolean;
}) {
  const updateParticipants = useUpdateToolboxTalkParticipants();
  const [rows, setRows] = useState<ToolboxTalkParticipantRow[]>(() =>
    toolboxTalkRowsFromServer(talk.participants),
  );
  const [syncedVersion, setSyncedVersion] = useState(talk.updatedAt);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (talk.updatedAt !== syncedVersion) {
    setSyncedVersion(talk.updatedAt);
    setRows(toolboxTalkRowsFromServer(talk.participants));
  }

  function updateRow(
    key: string,
    updater: (row: ToolboxTalkParticipantRow) => ToolboxTalkParticipantRow,
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

    const validationError = validateToolboxTalkParticipantRows(rows);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await updateParticipants.mutateAsync({
        id: talk.id,
        participants: toolboxTalkRowsToInput(rows),
      });
      setMessage("Attendance and acknowledgements saved.");
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
        title="Attendees and acknowledgement"
        description={ATTENDANCE_RECORD_COMPLETION_HINT}
        action={
          <Badge tone="neutral">
            {talk.acknowledgedCount}/{talk.participantCount} acknowledged
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {!canEdit && (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {talk.status === "SCHEDULED"
              ? "Only the talk author or HSE management can record attendance for this scheduled talk."
              : "This talk is terminal. Attendance and acknowledgement records are immutable."}
          </p>
        )}

        {canEdit && (
          <>
            <ParticipantPicker
              siteId={talk.site.id}
              exclude={rows.map((row) =>
                row.kind === "EMPLOYEE"
                  ? `employee:${row.employeeId}`
                  : `contractor:${row.contractorPersonnelId}`,
              )}
              onAdd={(picked) =>
                setRows((current) => [
                  ...current,
                  createToolboxTalkParticipantRow(picked),
                ])
              }
            />

            {rows.length === 0 ? (
              <p className="text-sm text-muted">
                No attendees recorded yet. Add at least one attendee and record
                acknowledgement before completion.
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
                        id={`toolbox-attendance-${row.key}`}
                        value={row.attendance}
                        onChange={(event) => {
                          const attendance = event.target
                            .value as ParticipantAttendanceState;
                          updateRow(row.key, (current) => ({
                            ...current,
                            attendance,
                            acknowledged:
                              attendance === "ATTENDED"
                                ? current.acknowledged
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
                          checked={row.acknowledged}
                          disabled={row.attendance !== "ATTENDED"}
                          onChange={(event) =>
                            updateRow(row.key, (current) => ({
                              ...current,
                              acknowledged: event.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-line"
                        />
                        Acknowledged
                      </label>

                      <TextField
                        label="Notes"
                        id={`toolbox-notes-${row.key}`}
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
                      Attendee {index + 1}. Acknowledgement confirms the briefing
                      was received and is not a competency claim.
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

        {!canEdit && talk.participants.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Attendee
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Attendance
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Acknowledged
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
                      {row.acknowledged ? "Acknowledged" : "Not acknowledged"}
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

        {!canEdit && talk.participants.length === 0 && (
          <p className="text-sm text-muted">
            No attendees were recorded on this talk.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
