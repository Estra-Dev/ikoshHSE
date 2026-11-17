"use client";

import { ErrorState, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePersonTrainingHistory } from "@/lib/api/training";
import type { WorkforceParticipantKind } from "@/lib/api/types";
import { TrainingHistoryTable } from "./training-history-table";

/**
 * Staff view of one person's training history. The API filters records through
 * the viewer's site scope and returns only the requested person's row.
 */
export function PersonTrainingHistory({
  kind,
  personId,
  title = "Training history",
}: {
  kind: WorkforceParticipantKind;
  personId: string;
  title?: string;
}) {
  const history = usePersonTrainingHistory(kind, personId);
  const records = history.data?.records ?? [];

  return (
    <Card>
      <CardHeader
        title={title}
        description="Site-scoped records for this person only. Colleague attendance is never included."
        action={
          <Badge tone="neutral">
            {history.isFetching
              ? "Updating…"
              : `${records.length} record${records.length === 1 ? "" : "s"}`}
          </Badge>
        }
      />
      <CardBody>
        {history.isError ? (
          <ErrorState
            title="Unable to load training history"
            message={
              history.error instanceof Error
                ? history.error.message
                : "Please try again."
            }
          />
        ) : history.isLoading ? (
          <Spinner label="Loading training history..." />
        ) : records.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            No training sessions are on record for this person within your site
            scope.
          </p>
        ) : (
          <TrainingHistoryTable records={records} />
        )}
      </CardBody>
    </Card>
  );
}
