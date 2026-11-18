"use client";

import { ErrorState, Spinner } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
  TD,
  TH,
} from "@/components/ui/table";
import { usePersonPpeHistory } from "@/lib/api/ppe";
import type {
  PpeIssuanceSummary,
  WorkforceParticipantKind,
} from "@/lib/api/types";
import { formatUtcDateTime } from "@/lib/dashboard-format";
import {
  formatPpeItemName,
  PPE_CONDITION_LABELS,
  PPE_STATUS_LABELS,
} from "@/lib/ppe";

function statusTone(status: PpeIssuanceSummary["status"]) {
  if (status === "ISSUED") return "blue" as const;
  if (status === "RETURNED") return "green" as const;
  if (status === "REPLACED") return "violet" as const;
  return "red" as const;
}

/**
 * Staff view of one person's PPE history. Access is evaluated against each
 * record's own site, so a person's later reassignment does not hide history
 * from the site that issued it.
 */
export function PersonPpeHistory({
  kind,
  personId,
  title = "PPE history",
}: {
  kind: WorkforceParticipantKind;
  personId: string;
  title?: string;
}) {
  const history = usePersonPpeHistory(kind, personId);
  const records = history.data?.records ?? [];

  return (
    <Card>
      <CardHeader
        title={title}
        description="Site-scoped issue, return and replacement history for this person only."
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
            title="Unable to load PPE history"
            message={
              history.error instanceof Error
                ? history.error.message
                : "Please try again."
            }
          />
        ) : history.isLoading ? (
          <Spinner label="Loading PPE history..." />
        ) : records.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            No PPE issuances are on record for this person within your site
            scope.
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TH scope="col">Item</TH>
                <TH scope="col">Quantity</TH>
                <TH scope="col">Issued</TH>
                <TH scope="col">Site</TH>
                <TH scope="col">Condition</TH>
                <TH scope="col">Status</TH>
                <TH scope="col">Returned</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TD className="font-medium text-navy-900">
                    {formatPpeItemName(record.item)}
                  </TD>
                  <TD className="tabular text-muted">{record.quantity}</TD>
                  <TD className="whitespace-nowrap text-muted">
                    {formatUtcDateTime(record.issuedOn)}
                  </TD>
                  <TD className="text-muted">
                    {record.site.name ?? record.project.name ?? "—"}
                  </TD>
                  <TD className="text-muted">
                    {PPE_CONDITION_LABELS[record.conditionAtIssue]}
                    {record.returnCondition
                      ? ` → ${PPE_CONDITION_LABELS[record.returnCondition]}`
                      : ""}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(record.status)}>
                      {PPE_STATUS_LABELS[record.status]}
                    </Badge>
                  </TD>
                  <TD className="text-muted">
                    {record.returnedOn
                      ? `${formatUtcDateTime(record.returnedOn)}${
                          record.restocked ? " · restocked" : ""
                        }`
                      : "—"}
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
