"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextareaField } from "@/components/ui/fields";
import { useUpdateTrainingSessionStatus } from "@/lib/api/training";
import type {
  AttendanceRecordStatus,
  IkoshRole,
  TrainingSessionSummary,
} from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { nextAttendanceStatuses } from "@/lib/attendance-records";
import {
  canCancelTrainingSession,
  canCompleteTrainingSession,
  canCreateTraining,
} from "@/lib/permissions";

/**
 * Forward-only workflow controls. Completion requires at least one attended
 * participant; cancellation requires a reason. Both terminal states are final.
 */
export function TrainingStatusPanel({
  session,
  role,
  viewerId,
}: {
  session: TrainingSessionSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}) {
  const updateStatus = useUpdateTrainingSessionStatus();
  const transitions = nextAttendanceStatuses(session.status).filter(
    (next) =>
      next === "COMPLETED"
        ? canCompleteTrainingSession(role, viewerId, session)
        : next === "CANCELLED"
          ? canCancelTrainingSession(role, viewerId, session)
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

    if (effectiveTarget === "COMPLETED" && session.attendedCount === 0) {
      setError(
        "Record at least one attended participant before completing this session.",
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
        id: session.id,
        input: {
          status: effectiveTarget,
          ...(effectiveTarget === "CANCELLED"
            ? { reason: trimmedReason }
            : {}),
        },
      });
      setReason("");
      setMessage(`Session moved to ${formatHseLabel(effectiveTarget)}.`);
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
        description="Sessions are scheduled, then completed or cancelled. Terminal sessions are immutable."
      />
      <CardBody className="space-y-4">
        {session.status === "COMPLETED" ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            This training session is completed. Attendance and certificate
            records cannot be changed.
          </p>
        ) : session.status === "CANCELLED" ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            This training session was cancelled and accepts no further
            attendance or evidence.
          </p>
        ) : !canAct ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {!canCreateTraining(role)
              ? "Your role can view this session but cannot progress it."
              : "Only the session author or HSE management can complete or cancel this session."}
          </p>
        ) : (
          <>
            <SelectField
              label="Next status"
              id="training-next-status"
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
                {session.attendedCount === 0
                  ? "Record at least one attended participant before completing this session."
                  : `${session.attendedCount} participant${
                      session.attendedCount === 1 ? "" : "s"
                    } will be recorded as having attended.`}
              </p>
            )}

            {effectiveTarget === "CANCELLED" && (
              <TextareaField
                label="Cancellation reason (required)"
                id="training-cancellation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Why is this session being cancelled?"
              />
            )}

            <Button
              onClick={() => void handleSubmit()}
              isLoading={updateStatus.isPending}
            >
              {effectiveTarget === "COMPLETED"
                ? "Mark completed"
                : "Cancel session"}
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
