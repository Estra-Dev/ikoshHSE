"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, Spinner } from "@/components/ui/feedback";
import { RiskAssessmentStatusBadge } from "@/components/risk-assessments/risk-assessment-badges";
import { useLinkableRiskAssessments } from "@/lib/api/risk-assessments";
import type {
  PermitLinkedRiskAssessment,
  RiskAssessmentSummary,
} from "@/lib/api/types";
import {
  isRiskAssessmentEligibleForPermit,
  MAX_LINKED_RISK_ASSESSMENTS,
  toggleLinkedRiskAssessment,
} from "@/lib/permits";
import {
  isCurrentRiskAssessment,
  riskAssessmentDetailHref,
  riskAssessmentRevisionLabel,
} from "@/lib/risk-assessments";

interface PermitRiskAssessmentSelectorProps {
  projectId: string;
  siteId: string;
  selected: readonly PermitLinkedRiskAssessment[];
  onChange: (next: PermitLinkedRiskAssessment[]) => void;
  error?: string;
}

function toLinkedRiskAssessment(
  assessment: RiskAssessmentSummary,
): PermitLinkedRiskAssessment {
  return {
    id: assessment.id,
    title: assessment.title,
    revision: assessment.revision,
    isCurrent: isCurrentRiskAssessment(assessment),
    status: assessment.status,
    project: assessment.project,
    site: assessment.site,
    owner: assessment.owner,
  };
}

/**
 * Optional permit-to-assessment linking. Only current approved assessments for
 * the permit's exact project and site are offered. Links that no longer meet
 * that rule stay visible so historical references are never lost silently.
 */
export function PermitRiskAssessmentSelector({
  projectId,
  siteId,
  selected,
  onChange,
  error,
}: PermitRiskAssessmentSelectorProps) {
  const query = useLinkableRiskAssessments({ projectId, siteId });

  const eligible = (query.data?.riskAssessments ?? []).filter((assessment) =>
    isRiskAssessmentEligibleForPermit(assessment, projectId, siteId),
  );
  const eligibleIds = new Set(eligible.map((assessment) => assessment.id));
  const selectedIds = new Set(selected.map((link) => link.id));
  const atLimit = selected.length >= MAX_LINKED_RISK_ASSESSMENTS;

  // While the eligible list is loading or failed, keep every selected link
  // visible. Once it loads, only links outside the eligible set are separated.
  const retained = selected.filter(
    (link) => !query.isSuccess || !eligibleIds.has(link.id),
  );

  function toggle(assessment: RiskAssessmentSummary): void {
    const currentIds = selected.map((link) => link.id);
    const nextIds = toggleLinkedRiskAssessment(currentIds, assessment.id);

    if (nextIds.length === currentIds.length) {
      return;
    }

    const byId = new Map(selected.map((link) => [link.id, link]));
    byId.set(assessment.id, toLinkedRiskAssessment(assessment));

    onChange(
      nextIds
        .map((id) => byId.get(id))
        .filter(
          (link): link is PermitLinkedRiskAssessment => link !== undefined,
        ),
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        Linked risk assessments (optional)
      </legend>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Only current approved assessments for the selected project and site
          can be linked. A permit can link up to{" "}
          {MAX_LINKED_RISK_ASSESSMENTS}.
        </p>
        <Badge tone={atLimit ? "amber" : "neutral"}>
          {selected.length} / {MAX_LINKED_RISK_ASSESSMENTS}
        </Badge>
      </div>

      {!projectId || !siteId ? (
        <p className="text-sm text-muted">
          Choose a project and site to see eligible risk assessments.
        </p>
      ) : query.isLoading ? (
        <Spinner label="Loading eligible risk assessments..." />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-red-700">
          Unable to load eligible risk assessments.{" "}
          {query.error instanceof Error
            ? query.error.message
            : "Please try again."}
        </p>
      ) : eligible.length === 0 ? (
        <p className="text-sm text-muted">
          No current approved risk assessments are available for this project
          and site.
        </p>
      ) : (
        <div className="grid gap-2">
          {eligible.map((assessment) => {
            const checked = selectedIds.has(assessment.id);
            const disabled = !checked && atLimit;

            return (
              <label
                key={assessment.id}
                className={`flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink ${
                  disabled ? "opacity-60" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(assessment)}
                  className="mt-0.5 h-4 w-4 rounded border-line text-navy-700 focus:ring-navy-600"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {assessment.title || "Untitled risk assessment"}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {riskAssessmentRevisionLabel(assessment.revision)}
                    <RiskAssessmentStatusBadge status={assessment.status} />
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {query.data &&
        query.data.pagination.total > query.data.pagination.limit && (
          <p className="text-xs text-muted">
            Showing the first {query.data.pagination.limit} approved assessments
            for this project and site. Older assessments may not appear.
          </p>
        )}

      {retained.length > 0 && (
        <div className="space-y-2 rounded-lg border border-line bg-navy-50/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {query.isSuccess
              ? "Linked but no longer selectable"
              : "Linked assessments"}
          </p>
          <p className="text-xs text-muted">
            These links remain on the permit unless you remove them. Historical
            references are preserved when the draft is saved.
          </p>
          <ul className="space-y-2">
            {retained.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={riskAssessmentDetailHref(link.id)}
                    className="text-sm font-medium text-navy-700 transition hover:text-navy-900"
                  >
                    {link.title || "Untitled risk assessment"}
                  </Link>
                  <p className="mt-1 text-xs text-muted">
                    {riskAssessmentRevisionLabel(link.revision)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {link.status ? (
                    <RiskAssessmentStatusBadge status={link.status} />
                  ) : (
                    <Badge tone="neutral">Unknown status</Badge>
                  )}
                  <Badge tone={link.isCurrent ? "green" : "neutral"} dot>
                    {link.isCurrent ? "Current" : "Historical"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      onChange(
                        selected.filter((value) => value.id !== link.id),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}
