"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import { useIncidents } from "@/lib/api/incidents";
import {
  useCreateRiskAssessmentRevision,
  useRiskAssessmentRevisions,
} from "@/lib/api/risk-assessments";
import {
  RISK_REVIEW_TRIGGERS,
  type RiskAssessmentSummary,
  type RiskReviewTrigger,
} from "@/lib/api/types";
import { formatUtcDate } from "@/lib/dashboard-format";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  riskAssessmentDetailHref,
  riskAssessmentRevisionLabel,
} from "@/lib/risk-assessments";
import { RiskAssessmentStatusBadge } from "./risk-assessment-badges";

interface RiskAssessmentRevisionsPanelProps {
  assessment: RiskAssessmentSummary;
  canCreate: boolean;
}

/**
 * Controlled revision history. A revision is a new draft cloned from the
 * current approved assessment; approving it supersedes the source atomically.
 * Only the current approved revision can be revised.
 */
export function RiskAssessmentRevisionsPanel({
  assessment,
  canCreate,
}: RiskAssessmentRevisionsPanelProps) {
  const router = useRouter();
  const revisions = useRiskAssessmentRevisions(assessment.id);
  const incidents = useIncidents({
    siteId: assessment.site?.id,
    limit: 100,
  });
  const createRevision = useCreateRiskAssessmentRevision();

  const [reviewTrigger, setReviewTrigger] = useState<RiskReviewTrigger>(
    "CHANGED_CONDITIONS",
  );
  const [incidentId, setIncidentId] = useState("");
  const [reviewDate, setReviewDate] = useState(
    assessment.reviewDate ? assessment.reviewDate.slice(0, 10) : "",
  );
  const [error, setError] = useState("");

  const items = revisions.data?.riskAssessments ?? [];
  const canRevise = canCreate && assessment.isCurrent;

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");

    try {
      const result = await createRevision.mutateAsync({
        id: assessment.id,
        input: {
          reviewTrigger,
          ...(reviewTrigger === "INCIDENT" && incidentId
            ? { incidentId }
            : {}),
          reviewDate: reviewDate
            ? new Date(`${reviewDate}T00:00:00.000Z`).toISOString()
            : null,
        },
      });

      router.push(riskAssessmentDetailHref(result.riskAssessment.id));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The revision could not be created.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Revision history"
        description="Controlled revisions preserve the approved record instead of overwriting it."
        action={<Badge tone="neutral">{items.length}</Badge>}
      />
      <CardBody className="space-y-4">
        {revisions.isLoading ? (
          <p className="text-sm text-muted">Loading revisions...</p>
        ) : revisions.isError ? (
          <p role="alert" className="text-sm text-red-700">
            Revision history could not be loaded.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">
            No revisions have been recorded for this assessment.
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={riskAssessmentDetailHref(item.id)}
                    className="text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
                  >
                    {riskAssessmentRevisionLabel(item.revision)}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.isCurrent && <Badge tone="green">Current</Badge>}
                    {item.isSuperseded && (
                      <Badge tone="neutral">Superseded</Badge>
                    )}
                    <RiskAssessmentStatusBadge status={item.status} />
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Created {formatUtcDate(item.createdAt)}
                  {item.reviewTrigger
                    ? ` · ${formatHseLabel(item.reviewTrigger)}`
                    : ""}
                  {item.reviewTriggerIncident
                    ? ` · ${item.reviewTriggerIncident.title ?? "Linked incident"}`
                    : ""}
                </p>
                {item.supersededAt && (
                  <p className="text-xs text-muted">
                    Superseded {formatUtcDate(item.supersededAt)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        {canRevise ? (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-3 border-t border-line pt-4"
          >
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}

            <SelectField
              label="Review trigger"
              id="revision-trigger"
              value={reviewTrigger}
              onChange={(event) => {
                setReviewTrigger(event.target.value as RiskReviewTrigger);
                setIncidentId("");
              }}
              options={RISK_REVIEW_TRIGGERS.map((trigger) => ({
                value: trigger,
                label: formatHseLabel(trigger),
              }))}
            />

            {reviewTrigger === "INCIDENT" && (
              <SelectField
                label="Related incident"
                id="revision-incident"
                value={incidentId}
                onChange={(event) => setIncidentId(event.target.value)}
                hint="Only incidents at the same site can be linked."
                options={[
                  { value: "", label: "Do not link an incident" },
                  ...(incidents.data?.incidents ?? []).map((incident) => ({
                    value: incident.id,
                    label: `${incident.title || formatHseLabel(incident.type)} · ${formatUtcDate(incident.occurredAt)}`,
                  })),
                ]}
                disabled={incidents.isLoading}
              />
            )}

            <TextField
              label="Next review date"
              id="revision-review-date"
              type="date"
              value={reviewDate}
              onChange={(event) => setReviewDate(event.target.value)}
            />

            <Button type="submit" isLoading={createRevision.isPending}>
              Create revision
            </Button>
          </form>
        ) : (
          <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-sm leading-6 text-muted">
            {assessment.isSuperseded
              ? "This revision has been superseded. Open the current revision to create the next one."
              : assessment.status === "APPROVED"
                ? "Only HSE authors can create a controlled revision."
                : "Revisions can only be created from the current approved assessment."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
