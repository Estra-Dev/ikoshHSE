"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextareaField } from "@/components/ui/fields";
import { useUpdateInspectionStatus } from "@/lib/api/inspections";
import type {
  IkoshRole,
  InspectionStatus,
  InspectionSummary,
} from "@/lib/api/types";
import { nextInspectionStatuses } from "@/lib/inspections";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  canConductInspections,
  canProgressInspection,
} from "@/lib/permissions";

interface InspectionStatusPanelProps {
  inspection: InspectionSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}

/**
 * Workflow controls mirror the server's forward-only transitions. Cancellation
 * is offered only to HSE management, and completion requires a finding or
 * completion notes.
 */
export function InspectionStatusPanel({
  inspection,
  role,
  viewerId,
}: InspectionStatusPanelProps) {
  const updateStatus = useUpdateInspectionStatus();
  const transitions = nextInspectionStatuses(inspection.status).filter(
    (next): next is Exclude<InspectionStatus, "SCHEDULED"> =>
      next !== "SCHEDULED" &&
      canProgressInspection(role, viewerId, inspection, next),
  );

  const [target, setTarget] = useState<InspectionStatus | "">(
    transitions[0] ?? "",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // The inspection changes after each mutation, so a previously selected
  // target may no longer be a legal transition.
  const effectiveTarget =
    target !== "" && target !== "SCHEDULED" && transitions.includes(target)
      ? target
      : (transitions[0] ?? "");

  async function handleSubmit(): Promise<void> {
    setError("");
    setMessage("");

    if (!effectiveTarget) {
      return;
    }

    const trimmedNotes = notes.trim();

    if (
      effectiveTarget === "COMPLETED" &&
      inspection.findings.length === 0 &&
      !trimmedNotes
    ) {
      setError(
        "Record at least one finding or completion notes before completing this inspection.",
      );
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: inspection.id,
        input: {
          status: effectiveTarget,
          ...(effectiveTarget === "COMPLETED" && trimmedNotes
            ? { completionNotes: trimmedNotes }
            : {}),
        },
      });
      setNotes("");
      setMessage(`Inspection moved to ${formatHseLabel(effectiveTarget)}.`);
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
        description="Inspections move forward: scheduled, in progress, completed. Cancellation ends an inspection that will not take place."
      />
      <CardBody className="space-y-4">
        {inspection.status === "COMPLETED" ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            This inspection is completed. Findings can still be followed up with
            corrective actions.
          </p>
        ) : inspection.status === "CANCELLED" ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            This inspection was cancelled and accepts no further findings or
            evidence.
          </p>
        ) : !canAct ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {!canConductInspections(role)
              ? "Your role can view this inspection but cannot progress it."
              : "Only the assigned inspector or HSE management can progress this inspection."}
          </p>
        ) : (
          <>
            <SelectField
              label="Next status"
              id="inspection-next-status"
              value={effectiveTarget}
              onChange={(event) => {
                setTarget(event.target.value as InspectionStatus);
                setNotes("");
                setError("");
                setMessage("");
              }}
              options={transitions.map((status) => ({
                value: status,
                label: formatHseLabel(status),
              }))}
            />

            {effectiveTarget === "COMPLETED" && (
              <TextareaField
                label={
                  inspection.findings.length === 0
                    ? "Completion notes (required)"
                    : "Completion notes (optional)"
                }
                id="inspection-status-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Describe the outcome of the inspection."
              />
            )}

            <Button
              onClick={() => void handleSubmit()}
              isLoading={updateStatus.isPending}
            >
              {effectiveTarget === "COMPLETED"
                ? "Mark completed"
                : effectiveTarget === "CANCELLED"
                  ? "Cancel inspection"
                  : "Start inspection"}
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
