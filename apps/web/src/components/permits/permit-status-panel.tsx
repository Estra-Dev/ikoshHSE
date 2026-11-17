"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextareaField } from "@/components/ui/fields";
import { useUpdatePermitStatus } from "@/lib/api/permits";
import type {
  IkoshRole,
  PermitClosureChecks,
  PermitStatus,
  PermitSummary,
} from "@/lib/api/types";
import {
  isPermitExpired,
  isWithinPermitValidity,
  nextPermitStatuses,
  PERMIT_CLOSURE_CHECK_LABELS,
} from "@/lib/permits";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  canActivatePermit,
  canApprovePermit,
  canCancelPermit,
  canClosePermit,
  canResumePermit,
  canSubmitPermit,
  canSuspendPermit,
} from "@/lib/permissions";

interface PermitStatusPanelProps {
  permit: PermitSummary;
  role: IkoshRole | undefined;
  viewerId: string | undefined;
  assignedSites: readonly string[];
}

const EMPTY_CHECKS: PermitClosureChecks = {
  workAreaSecured: false,
  personnelAccountedFor: false,
  equipmentIsolated: false,
  siteHandoverCompleted: false,
};

/**
 * Workflow controls mirror the server's lifecycle and validity rules. Expired
 * or not-yet-valid permits never offer activation or resumption; closing stays
 * available so an expired active permit can be cleared safely.
 */
export function PermitStatusPanel({
  permit,
  role,
  viewerId,
  assignedSites,
}: PermitStatusPanelProps) {
  const updateStatus = useUpdatePermitStatus();
  const expired = isPermitExpired(permit);
  const withinValidity = isWithinPermitValidity(permit);

  const transitions = nextPermitStatuses(permit.status).filter((next) => {
    switch (next) {
      case "SUBMITTED":
        return canSubmitPermit(role, viewerId, permit);
      case "APPROVED":
        return canApprovePermit(role, viewerId, permit) && !expired;
      case "REJECTED":
        return canApprovePermit(role, viewerId, permit);
      case "ACTIVE":
        return permit.status === "SUSPENDED"
          ? canResumePermit(role, viewerId, permit) && withinValidity
          : canActivatePermit(role, viewerId, permit) && withinValidity;
      case "SUSPENDED":
        return (
          canSuspendPermit(role, viewerId, permit, assignedSites) && !expired
        );
      case "CLOSED":
        return canClosePermit(role, viewerId, permit);
      case "CANCELLED":
        return canCancelPermit(role, viewerId, permit);
      default:
        return false;
    }
  });

  const [target, setTarget] = useState<PermitStatus | "">(
    transitions[0] ?? "",
  );
  const [reason, setReason] = useState("");
  const [closureNotes, setClosureNotes] = useState("");
  const [closureChecks, setClosureChecks] =
    useState<PermitClosureChecks>(EMPTY_CHECKS);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // The permit changes after each mutation, so a previously selected target may
  // no longer be a legal transition.
  const effectiveTarget =
    target !== "" && transitions.includes(target)
      ? target
      : (transitions[0] ?? "");

  const requiresReason =
    effectiveTarget === "REJECTED" ||
    effectiveTarget === "CANCELLED" ||
    effectiveTarget === "SUSPENDED";

  const requiresClosure = effectiveTarget === "CLOSED";

  function resetFields(): void {
    setReason("");
    setClosureNotes("");
    setClosureChecks(EMPTY_CHECKS);
    setError("");
    setMessage("");
  }

  async function handleSubmit(): Promise<void> {
    setError("");
    setMessage("");

    if (!effectiveTarget) {
      return;
    }

    const trimmedReason = reason.trim();

    if (requiresReason && !trimmedReason) {
      setError("A reason is required for this status change.");
      return;
    }

    if (requiresClosure) {
      if (
        !closureChecks.workAreaSecured ||
        !closureChecks.personnelAccountedFor ||
        !closureChecks.equipmentIsolated ||
        !closureChecks.siteHandoverCompleted
      ) {
        setError("Confirm every close-out check before closing this permit.");
        return;
      }

      if (!closureNotes.trim()) {
        setError("Closure notes are required.");
        return;
      }
    }

    try {
      await updateStatus.mutateAsync({
        id: permit.id,
        input: {
          status: effectiveTarget,
          ...(requiresReason ? { reason: trimmedReason } : {}),
          ...(requiresClosure
            ? {
                closureChecks,
                closureNotes: closureNotes.trim(),
              }
            : {}),
        },
      });
      resetFields();
      setMessage(`Permit moved to ${formatHseLabel(effectiveTarget)}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The status could not be updated.",
      );
    }
  }

  function actionLabel(status: PermitStatus): string {
    switch (status) {
      case "ACTIVE":
        return permit.status === "SUSPENDED" ? "Resume permit" : "Activate permit";
      case "SUBMITTED":
        return "Submit for approval";
      case "APPROVED":
        return "Approve permit";
      case "REJECTED":
        return "Reject permit";
      case "SUSPENDED":
        return "Suspend permit";
      case "CLOSED":
        return "Close permit";
      case "CANCELLED":
        return "Cancel permit";
      default:
        return `Move to ${formatHseLabel(status)}`;
    }
  }

  const canAct = transitions.length > 0;

  return (
    <Card>
      <CardHeader
        title="Workflow"
        description="Draft, submit, approve and activate permits; suspend or close work that is already in progress."
      />
      <CardBody className="space-y-4">
        {expired && permit.status !== "CLOSED" && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            This permit expired on {formatUtcDateTime(permit.validTo)}. It
            cannot be activated or resumed; close it to record the final
            handover.
          </p>
        )}

        {!expired &&
          (permit.status === "APPROVED" || permit.status === "SUSPENDED") &&
          !withinValidity && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This permit is not yet inside its validity window. Activation
              opens from {formatUtcDateTime(permit.validFrom)}.
            </p>
          )}

        {permit.status === "DRAFT" && (
          <p className="text-sm text-muted">
            Draft permits are editable by their creator, responsible person or
            HSE management.
          </p>
        )}

        {permit.status === "SUBMITTED" && (
          <p className="text-sm text-muted">
            Awaiting HSE management review. The creator, responsible person and
            submitter cannot approve their own permit.
          </p>
        )}

        {permit.status === "ACTIVE" && withinValidity && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Permit active. Work may proceed only within the recorded validity
            window and controls.
          </p>
        )}

        {permit.status === "SUSPENDED" && withinValidity && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Work is suspended. Resuming requires the permit to still be inside
            its validity window.
          </p>
        )}

        {permit.status === "CLOSED" && (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            This permit is closed. The close-out checks and notes are retained
            for the audit trail.
          </p>
        )}

        {(permit.status === "REJECTED" || permit.status === "CANCELLED") && (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            This permit is {formatHseLabel(permit.status).toLowerCase()} and
            accepts no further workflow changes or evidence.
          </p>
        )}

        {!canAct &&
          permit.status !== "CLOSED" &&
          permit.status !== "REJECTED" &&
          permit.status !== "CANCELLED" && (
            <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
              Your role can view this permit but cannot perform the next
              workflow action.
            </p>
          )}

        {canAct && (
          <>
            <SelectField
              label="Next status"
              id="permit-next-status"
              value={effectiveTarget}
              onChange={(event) => {
                setTarget(event.target.value as PermitStatus);
                resetFields();
              }}
              options={transitions.map((status) => ({
                value: status,
                label: formatHseLabel(status),
              }))}
            />

            {requiresReason && (
              <TextareaField
                label="Reason (required)"
                id="permit-status-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Explain why this permit is being rejected, cancelled or suspended."
              />
            )}

            {requiresClosure && (
              <div className="space-y-3">
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    Close-out checks
                  </legend>
                  {(
                    Object.keys(
                      PERMIT_CLOSURE_CHECK_LABELS,
                    ) as (keyof PermitClosureChecks)[]
                  ).map((check) => (
                    <label
                      key={check}
                      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={closureChecks[check]}
                        onChange={(event) =>
                          setClosureChecks((current) => ({
                            ...current,
                            [check]: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-line text-navy-700 focus:ring-navy-600"
                      />
                      {PERMIT_CLOSURE_CHECK_LABELS[check]}
                    </label>
                  ))}
                </fieldset>

                <TextareaField
                  label="Closure notes (required)"
                  id="permit-closure-notes"
                  value={closureNotes}
                  onChange={(event) => setClosureNotes(event.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder="Record the handover and final condition of the work area."
                />
              </div>
            )}

            <Button
              onClick={() => void handleSubmit()}
              isLoading={updateStatus.isPending}
            >
              {actionLabel(effectiveTarget as PermitStatus)}
            </Button>
          </>
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
