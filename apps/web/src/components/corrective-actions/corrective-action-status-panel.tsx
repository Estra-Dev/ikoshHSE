"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextareaField } from "@/components/ui/fields";
import { useUpdateCorrectiveActionStatus } from "@/lib/api/corrective-actions";
import type {
  CorrectiveActionStatus,
  CorrectiveActionSummary,
  IkoshRole,
} from "@/lib/api/types";
import { nextCorrectiveActionStatuses } from "@/lib/corrective-actions";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  canProgressCorrectiveAction,
  canProgressCorrectiveActions,
  canVerifyCorrectiveAction,
} from "@/lib/permissions";

interface CorrectiveActionStatusPanelProps {
  action: CorrectiveActionSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}

/**
 * Workflow controls mirror the server's forward-only transitions. Verification
 * is offered only to HSE management; completion requires notes, matching the
 * API validation.
 */
export function CorrectiveActionStatusPanel({
  action,
  role,
  viewerId,
}: CorrectiveActionStatusPanelProps) {
  const updateStatus = useUpdateCorrectiveActionStatus();
  const transitions = nextCorrectiveActionStatuses(action.status).filter(
    (next) =>
      canProgressCorrectiveAction(role, viewerId, action) &&
      (next !== "VERIFIED" || canVerifyCorrectiveAction(role, action)),
  );

  const [target, setTarget] = useState<CorrectiveActionStatus | "">(
    transitions[0] ?? "",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // The action changes after each mutation, so a previously selected target
  // may no longer be a legal transition.
  const effectiveTarget: CorrectiveActionStatus | "" = transitions.includes(
    target as CorrectiveActionStatus,
  )
    ? (target as CorrectiveActionStatus)
    : (transitions[0] ?? "");

  async function handleSubmit(): Promise<void> {
    setError("");
    setMessage("");

    if (!effectiveTarget) {
      return;
    }

    const trimmedNotes = notes.trim();

    if (effectiveTarget === "COMPLETED" && !trimmedNotes) {
      setError("Completion notes are required before completing an action.");
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: action.id,
        input: {
          status: effectiveTarget,
          ...(effectiveTarget === "COMPLETED" && trimmedNotes
            ? { completionNotes: trimmedNotes }
            : {}),
          ...(effectiveTarget === "VERIFIED" && trimmedNotes
            ? { verificationNotes: trimmedNotes }
            : {}),
        },
      });
      setNotes("");
      setMessage(`Action moved to ${formatHseLabel(effectiveTarget)}.`);
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
        description="Actions move forward only: open, in progress, completed, verified."
      />
      <CardBody className="space-y-4">
        {action.status === "VERIFIED" ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            This action is verified and closed. It no longer accepts changes or
            new evidence.
          </p>
        ) : !canAct ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {!canProgressCorrectiveActions(role)
              ? "Your role can view this action but cannot progress it."
              : canProgressCorrectiveAction(role, viewerId, action)
                ? "Only HSE management can verify closure at this stage."
                : "Only the assignee or HSE management can progress this action."}
          </p>
        ) : (
          <>
            <SelectField
              label="Next status"
              id="capa-next-status"
              value={effectiveTarget}
              onChange={(event) => {
                setTarget(event.target.value as CorrectiveActionStatus);
                setNotes("");
                setError("");
                setMessage("");
              }}
              options={transitions.map((status) => ({
                value: status,
                label: formatHseLabel(status),
              }))}
            />

            {(effectiveTarget === "COMPLETED" ||
              effectiveTarget === "VERIFIED") && (
              <TextareaField
                label={
                  effectiveTarget === "COMPLETED"
                    ? "Completion notes (required)"
                    : "Verification notes (optional)"
                }
                id="capa-status-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder={
                  effectiveTarget === "COMPLETED"
                    ? "Describe the work completed and evidence provided."
                    : "Record the verification decision."
                }
              />
            )}

            <Button
              onClick={() => void handleSubmit()}
              isLoading={updateStatus.isPending}
            >
              {effectiveTarget === "COMPLETED"
                ? "Mark completed"
                : effectiveTarget === "VERIFIED"
                  ? "Verify closure"
                  : "Start work"}
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
