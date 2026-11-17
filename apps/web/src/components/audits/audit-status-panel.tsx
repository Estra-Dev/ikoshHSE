"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextareaField } from "@/components/ui/fields";
import { useUpdateAuditStatus } from "@/lib/api/audits";
import type { AuditStatus, HseAuditSummary, IkoshRole } from "@/lib/api/types";
import { nextAuditStatuses } from "@/lib/audits";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  canConductAudits,
  canManageAudits,
  canProgressAudit,
} from "@/lib/permissions";

interface AuditStatusPanelProps {
  audit: HseAuditSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
}

/**
 * Workflow controls mirror the server's forward-only transitions. Cancellation
 * is offered only to HSE management, and completion requires a finding or
 * completion notes.
 */
export function AuditStatusPanel({
  audit,
  role,
  viewerId,
}: AuditStatusPanelProps) {
  const updateStatus = useUpdateAuditStatus();
  const transitions = nextAuditStatuses(audit.status).filter(
    (next): next is Exclude<AuditStatus, "PLANNED"> =>
      next !== "PLANNED" &&
      canProgressAudit(role, viewerId, audit, next),
  );

  const [target, setTarget] = useState<AuditStatus | "">(
    transitions[0] ?? "",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // The audit changes after each mutation, so a previously selected target may
  // no longer be a legal transition.
  const effectiveTarget =
    target !== "" && target !== "PLANNED" && transitions.includes(target)
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
      audit.findings.length === 0 &&
      !trimmedNotes
    ) {
      setError(
        "Record at least one finding or completion notes before completing this audit.",
      );
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: audit.id,
        input: {
          status: effectiveTarget,
          ...(effectiveTarget === "COMPLETED" && trimmedNotes
            ? { completionNotes: trimmedNotes }
            : {}),
        },
      });
      setNotes("");
      setMessage(`Audit moved to ${formatHseLabel(effectiveTarget)}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The status could not be updated.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Workflow"
        description="Audits move forward: planned, in progress, completed. Cancellation ends an audit that will not take place."
      />
      <CardBody className="space-y-4">
        {audit.status === "COMPLETED" ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            This audit is completed. Findings can still be followed up with
            corrective actions.
          </p>
        ) : audit.status === "CANCELLED" ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            This audit was cancelled and accepts no further checklist results,
            findings or evidence.
          </p>
        ) : transitions.length === 0 ? (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {!canConductAudits(role)
              ? "Your role can view this audit but cannot progress it."
              : canManageAudits(role)
                ? "No workflow action is available for this audit."
                : "Only an assigned auditor or HSE management can progress this audit."}
          </p>
        ) : (
          <>
            <SelectField
              label="Next status"
              id="audit-next-status"
              value={effectiveTarget}
              onChange={(event) => {
                setTarget(event.target.value as AuditStatus);
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
                  audit.findings.length === 0
                    ? "Completion notes (required)"
                    : "Completion notes (optional)"
                }
                id="audit-status-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Summarise the audit outcome."
              />
            )}

            <Button
              onClick={() => void handleSubmit()}
              isLoading={updateStatus.isPending}
            >
              {effectiveTarget === "COMPLETED"
                ? "Mark completed"
                : effectiveTarget === "CANCELLED"
                  ? "Cancel audit"
                  : "Start audit"}
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
