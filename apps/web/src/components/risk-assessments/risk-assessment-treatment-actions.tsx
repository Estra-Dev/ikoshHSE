"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/fields";
import {
  useCorrectiveActionAssignees,
  useRiskAssessmentTreatmentActions,
} from "@/lib/api/corrective-actions";
import { useCreateRiskTreatmentAction } from "@/lib/api/risk-assessments";
import type { RiskAssessmentSummary } from "@/lib/api/types";
import { formatUtcDate } from "@/lib/dashboard-format";
import { CorrectiveActionStatusBadge } from "@/components/corrective-actions/corrective-action-badges";

interface RiskAssessmentTreatmentActionsProps {
  assessment: RiskAssessmentSummary;
  canRaise: boolean;
}

/**
 * Treatment actions reuse the corrective action workflow. Multiple independent
 * actions may be raised against one hazard; the API derives project and site
 * from the assessment and never mutates approved content.
 */
export function RiskAssessmentTreatmentActions({
  assessment,
  canRaise,
}: RiskAssessmentTreatmentActionsProps) {
  const actions = useRiskAssessmentTreatmentActions(assessment.id);
  const assignees = useCorrectiveActionAssignees();
  const createAction = useCreateRiskTreatmentAction();

  const [hazardId, setHazardId] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");

  const items = actions.data?.correctiveActions ?? [];
  const counts = new Map<string, number>();

  for (const item of items) {
    if (item.riskAssessmentHazardId) {
      counts.set(
        item.riskAssessmentHazardId,
        (counts.get(item.riskAssessmentHazardId) ?? 0) + 1,
      );
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");

    if (!hazardId) {
      setError("Choose the hazard this action treats.");
      return;
    }

    if (!description.trim()) {
      setError("Describe the treatment action.");
      return;
    }

    if (!assignedTo) {
      setError("Assign an owner.");
      return;
    }

    if (!dueDate) {
      setError("Set a due date.");
      return;
    }

    try {
      await createAction.mutateAsync({
        assessmentId: assessment.id,
        hazardId,
        input: {
          description: description.trim(),
          assignedTo,
          dueDate: new Date(dueDate).toISOString(),
        },
      });

      setDescription("");
      setHazardId("");
      setAssignedTo("");
      setDueDate("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The treatment action could not be created.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Treatment actions"
        description="Additional controls tracked through the corrective action workflow."
        action={<Badge tone="neutral">{items.length}</Badge>}
      />
      <CardBody className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            No treatment actions have been raised for this assessment.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="space-y-1 py-3 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/corrective-actions/${item.id}`}
                    className="text-sm font-medium text-navy-700 underline-offset-2 hover:text-navy-900 hover:underline"
                  >
                    {item.description}
                  </Link>
                  <CorrectiveActionStatusBadge status={item.status} />
                </div>
                <p className="text-xs text-muted">
                  {item.assignedTo.firstName} {item.assignedTo.lastName}
                  <span aria-hidden="true"> · </span>
                  Due {formatUtcDate(item.dueDate)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {canRaise && assessment.status !== "ARCHIVED" && (
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
              label="Hazard"
              id="treatment-hazard"
              value={hazardId}
              onChange={(event) => setHazardId(event.target.value)}
              options={[
                { value: "", label: "Choose a hazard" },
                ...assessment.hazards.map((hazard, index) => {
                  const count = counts.get(hazard.id) ?? 0;

                  return {
                    value: hazard.id,
                    label: `Hazard ${index + 1}: ${hazard.hazard.slice(0, 60)}${
                      count > 0 ? ` (${count})` : ""
                    }`,
                  };
                }),
              ]}
            />

            <TextareaField
              label="Action"
              id="treatment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={5000}
              placeholder="What additional control will be implemented?"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Owner"
                id="treatment-owner"
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                options={[
                  { value: "", label: "Choose an owner" },
                  ...(assignees.data?.assignees ?? []).map((assignee) => ({
                    value: assignee.id,
                    label:
                      `${assignee.firstName} ${assignee.lastName}`.trim() ||
                      assignee.id,
                  })),
                ]}
                disabled={assignees.isLoading}
              />
              <TextField
                label="Due date"
                id="treatment-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>

            <Button type="submit" isLoading={createAction.isPending}>
              Raise treatment action
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
