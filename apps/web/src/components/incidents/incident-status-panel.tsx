"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/feedback";
import { incidentKeys, useUpdateIncidentStatus } from "@/lib/api/incidents";
import type { IncidentStatus, IncidentSummary } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { nextIncidentStatuses } from "@/lib/incident-workflow";

const ACTION_LABELS: Record<IncidentStatus, string> = {
  REPORTED: "Return to reported",
  TRIAGED: "Mark as triaged",
  CLOSED: "Close report",
};

/**
 * Management-only workflow control. Only the next forward transition is
 * offered, mirroring the server's REPORTED → TRIAGED → CLOSED rule. Closing
 * requires an explicit confirmation step.
 */
export function IncidentStatusPanel({
  incident,
}: {
  incident: IncidentSummary;
}) {
  const queryClient = useQueryClient();
  const updateStatus = useUpdateIncidentStatus();
  const [confirming, setConfirming] = useState<IncidentStatus | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const nextStatuses = nextIncidentStatuses(incident.status);

  async function handleAdvance(status: IncidentStatus): Promise<void> {
    setMessage("");
    setError("");

    try {
      await updateStatus.mutateAsync({ id: incident.id, input: { status } });
      setConfirming(null);
      setMessage(`Status moved to ${formatHseLabel(status)}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The status could not be changed.",
      );
      // The report may have changed since this page loaded.
      void queryClient.invalidateQueries({
        queryKey: incidentKeys.detail(incident.id),
      });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Workflow status"
        description="HSE management only. Status moves forward only and cannot be reopened."
      />
      <CardBody className="space-y-4">
        <p className="text-sm text-muted">
          Current status:{" "}
          <span className="font-medium text-ink">
            {formatHseLabel(incident.status)}
          </span>
        </p>

        {nextStatuses.length === 0 ? (
          <p className="rounded-lg border border-line bg-navy-50/50 px-4 py-3 text-sm leading-6 text-muted">
            This report is closed. The workflow is complete and cannot be
            reopened through this interface.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((status) => {
              const requiresConfirmation = status === "CLOSED";

              if (requiresConfirmation && confirming === status) {
                return (
                  <div key={status} className="flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      isLoading={updateStatus.isPending}
                      onClick={() => void handleAdvance(status)}
                    >
                      Confirm close
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={updateStatus.isPending}
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                );
              }

              return (
                <Button
                  key={status}
                  variant={requiresConfirmation ? "danger" : "primary"}
                  isLoading={!requiresConfirmation && updateStatus.isPending}
                  onClick={() => {
                    if (requiresConfirmation) {
                      setConfirming(status);
                      return;
                    }

                    void handleAdvance(status);
                  }}
                >
                  {ACTION_LABELS[status]}
                </Button>
              );
            })}
          </div>
        )}

        {confirming === "CLOSED" && (
          <p className="text-sm leading-6 text-amber-800">
            Closing is permanent. Make sure the investigation and corrective
            actions are complete before confirming.
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
