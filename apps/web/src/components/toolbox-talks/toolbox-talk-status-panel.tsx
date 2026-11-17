"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextareaField } from "@/components/ui/fields";
import { useUpdateToolboxTalkStatus } from "@/lib/api/toolbox-talks";
import type {
  AttendanceRecordStatus,
  IkoshRole,
  ToolboxTalkSummary,
} from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { nextAttendanceStatuses } from "@/lib/attendance-records";
import {
  canCancelToolboxTalk,
  canCompleteToolboxTalk,
  canCreateToolboxTalks,
} from "@/lib/permissions";

/**
 * Forward-only workflow controls. Completion requires at least one
 * acknowledged attendee; cancellation requires a reason. Both terminal states
 * are final.
 */
export function ToolboxTalkStatusPanel({
  talk,
  role,
  viewerId,
}: {
  talk: ToolboxTalkSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}) {
  const updateStatus = useUpdateToolboxTalkStatus();
  const transitions = nextAttendanceStatuses(talk.status).filter(
    (next) =>
      next === "COMPLETED"
        ? canCompleteToolboxTalk(role, viewerId, talk)
        : next === "CANCELLED"
          ? canCancelToolboxTalk(role, viewerId, talk)
          : false,
  );

  const [target, setTarget] = useState<AttendanceRecordStatus | "">(
    transitions[0] ?? "",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const effectiveTarget =
    target !== "" && transitions.includes(target)
      ? target
      : (transitions[0] ?? "");

  async function handleSubmit(): Promise<void> {
    setError("");
    setMessage("");

    if (!effectiveTarget) {
      return;
    }

    if (effectiveTarget === "COMPLETED" && talk.acknowledgedCount === 0) {
      setError(
        "Record at least one acknowledged attendee before completing this toolbox talk.",
      );
      return;
    }

    const trimmedReason = reason.trim();

    if (effectiveTarget === "CANCELLED" && !trimmedReason) {
      setError("Record a cancellation reason.");
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: talk.id,
        input: {
          status: effectiveTarget,
          ...(effectiveTarget === "CANCELLED"
            ? { reason: trimmedReason }
            : {}),
        },
      });
      setReason("");
      setMessage(`Talk moved to ${formatHseLabel(effectiveTarget)}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The status could not be updated.",
      );
    }
  }

  const canAct = transitions.length > 0;

  return (
    <Card>
      <CardHeader
        title="Workflow"
        description="Talks are scheduled, then completed or cancelled. Terminal talks are immutable."
      />
      <CardBody className="space-y-4">
        {talk.status === "COMPLETED" ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            This toolbox talk is completed. Attendance and acknowledgement
            records cannot be changed.
          </p>
        ) : talk.status === "CANCELLED" ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            This toolbox talk was cancelled and accepts no further attendance
            or evidence.
          </p>
        ) : !canAct ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {!canCreateToolboxTalks(role)
              ? "Your role can view this talk but cannot progress it."
              : "Only the talk author or HSE management can complete or cancel this talk."}
          </p>
        ) : (
          <>
            <SelectField
              label="Next status"
              id="toolbox-talk-next-status"
              value={effectiveTarget}
              onChange={(event) => {
                setTarget(event.target.value as AttendanceRecordStatus);
                setReason("");
                setError("");
                setMessage("");
              }}
              options={transitions.map((status) => ({
                value: status,
                label: formatHseLabel(status),
              }))}
            />

            {effectiveTarget === "COMPLETED" && (
              <p className="text-sm leading-6 text-muted">
                {talk.acknowledgedCount === 0
                  ? "Record at least one acknowledged attendee before completing this talk."
                  : `${talk.acknowledgedCount} attendee${
                      talk.acknowledgedCount === 1 ? "" : "s"
                    } will be recorded as having acknowledged the briefing.`}
              </p>
            )}

            {effectiveTarget === "CANCELLED" && (
              <TextareaField
                label="Cancellation reason (required)"
                id="toolbox-talk-cancellation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Why is this talk being cancelled?"
              />
            )}

            <Button
              onClick={() => void handleSubmit()}
              isLoading={updateStatus.isPending}
            >
              {effectiveTarget === "COMPLETED"
                ? "Mark completed"
                : "Cancel talk"}
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
          </>
        )}
      </CardBody>
    </Card>
  );
}
