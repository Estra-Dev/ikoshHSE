"use client";

import { ErrorState, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePersonToolboxTalkHistory } from "@/lib/api/toolbox-talks";
import type { WorkforceParticipantKind } from "@/lib/api/types";
import { ToolboxTalkHistoryTable } from "./toolbox-talk-history-table";

/**
 * Staff view of one person's toolbox talk history. The API filters records
 * through the viewer's site scope and returns only the requested person's row.
 */
export function PersonToolboxTalkHistory({
  kind,
  personId,
  title = "Toolbox talk history",
}: {
  kind: WorkforceParticipantKind;
  personId: string;
  title?: string;
}) {
  const history = usePersonToolboxTalkHistory(kind, personId);
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
            title="Unable to load toolbox talk history"
            message={
              history.error instanceof Error
                ? history.error.message
                : "Please try again."
            }
          />
        ) : history.isLoading ? (
          <Spinner label="Loading toolbox talk history..." />
        ) : records.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            No toolbox talks are on record for this person within your site
            scope.
          </p>
        ) : (
          <ToolboxTalkHistoryTable records={records} />
        )}
      </CardBody>
    </Card>
  );
}
