"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  useCreateRiskAssessment,
  useRiskAssessmentAssignees,
  useUpdateRiskAssessment,
} from "@/lib/api/risk-assessments";
import { useProjects, useSites } from "@/lib/api/worksites";
import type {
  CreateRiskAssessmentInput,
  RiskAssessmentHazardInput,
  RiskAssessmentSummary,
  UpdateRiskAssessmentInput,
} from "@/lib/api/types";
import {
  MAX_RISK_HAZARDS,
  riskAssessmentDetailHref,
  riskLevelFor,
  riskScore,
} from "@/lib/risk-assessments";
import { RiskLevelBadge } from "./risk-assessment-badges";

interface HazardRow {
  key: string;
  hazard: string;
  consequences: string;
  existingControls: string;
  likelihood: number;
  severity: number;
  residualLikelihood: number;
  residualSeverity: number;
  additionalControls: string;
}

let hazardKeySequence = 0;

function blankHazardRow(): HazardRow {
  hazardKeySequence += 1;

  return {
    key: `hazard-${hazardKeySequence}`,
    hazard: "",
    consequences: "",
    existingControls: "",
    likelihood: 3,
    severity: 3,
    residualLikelihood: 2,
    residualSeverity: 2,
    additionalControls: "",
  };
}

function hazardRowsFromAssessment(
  assessment: RiskAssessmentSummary,
): HazardRow[] {
  if (assessment.hazards.length === 0) {
    return [blankHazardRow()];
  }

  return assessment.hazards.map((hazard) => ({
    key: hazard.id,
    hazard: hazard.hazard,
    consequences: hazard.consequences,
    existingControls: hazard.existingControls,
    likelihood: hazard.likelihood,
    severity: hazard.severity,
    residualLikelihood: hazard.residualLikelihood,
    residualSeverity: hazard.residualSeverity,
    additionalControls: hazard.additionalControls,
  }));
}

const SCORE_OPTIONS = [1, 2, 3, 4, 5].map((score) => ({
  value: String(score),
  label: String(score),
}));

function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

interface RiskAssessmentFormProps {
  mode: "create" | "edit";
  assessment?: RiskAssessmentSummary;
  onDone?: () => void;
  onCancel?: () => void;
}

/**
 * Risk assessment authoring form shared by the create page and the draft edit
 * panel. Scores drive a live risk-band preview, but the API recomputes and
 * stores the authoritative levels on save.
 */
export function RiskAssessmentForm({
  mode,
  assessment,
  onDone,
  onCancel,
}: RiskAssessmentFormProps) {
  const router = useRouter();
  const createAssessment = useCreateRiskAssessment();
  const updateAssessment = useUpdateRiskAssessment();
  const assignees = useRiskAssessmentAssignees();
  const projects = useProjects();

  const [title, setTitle] = useState(assessment?.title ?? "");
  const [description, setDescription] = useState(
    assessment?.description ?? "",
  );
  const [projectId, setProjectId] = useState(assessment?.project.id ?? "");
  const [siteId, setSiteId] = useState(assessment?.site?.id ?? "");
  const [ownerId, setOwnerId] = useState(assessment?.owner?.id ?? "");
  const [reviewDate, setReviewDate] = useState(
    dateInputValue(assessment?.reviewDate),
  );
  const [hazards, setHazards] = useState<HazardRow[]>(() =>
    assessment ? hazardRowsFromAssessment(assessment) : [blankHazardRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  // Only fetch sites for the selected project so the pair cannot drift.
  const projectSites = useSites({ projectId, page: 1, limit: 100 });

  const pending = createAssessment.isPending || updateAssessment.isPending;

  function updateHazard(key: string, partial: Partial<HazardRow>): void {
    setHazards((current) =>
      current.map((row) => (row.key === key ? { ...row, ...partial } : row)),
    );
  }

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!title.trim()) {
      nextErrors.title = "Give this assessment a title.";
    } else if (title.trim().length > 300) {
      nextErrors.title = "Keep the title under 300 characters.";
    }

    if (!projectId) {
      nextErrors.projectId = "Choose a project.";
    }

    if (!ownerId) {
      nextErrors.ownerId = "Assign an owner.";
    }

    if (description.trim().length > 5000) {
      nextErrors.description = "Keep the description under 5,000 characters.";
    }

    if (hazards.length === 0) {
      nextErrors.hazards = "Record at least one hazard.";
    }

    if (hazards.length > MAX_RISK_HAZARDS) {
      nextErrors.hazards = `Keep the assessment to ${MAX_RISK_HAZARDS} hazards or fewer.`;
    }

    for (const row of hazards) {
      if (!row.hazard.trim()) {
        nextErrors[`${row.key}.hazard`] = "Describe the hazard.";
      } else if (row.hazard.trim().length > 500) {
        nextErrors[`${row.key}.hazard`] =
          "Keep the hazard under 500 characters.";
      }

      for (const field of [
        ["consequences", row.consequences],
        ["existingControls", row.existingControls],
        ["additionalControls", row.additionalControls],
      ] as const) {
        if (field[1].trim().length > 2000) {
          nextErrors[`${row.key}.${field[0]}`] =
            "Keep this field under 2,000 characters.";
        }
      }
    }

    return nextErrors;
  }

  function toHazardInput(row: HazardRow): RiskAssessmentHazardInput {
    return {
      hazard: row.hazard.trim(),
      ...(row.consequences.trim()
        ? { consequences: row.consequences.trim() }
        : {}),
      ...(row.existingControls.trim()
        ? { existingControls: row.existingControls.trim() }
        : {}),
      likelihood: row.likelihood,
      severity: row.severity,
      residualLikelihood: row.residualLikelihood,
      residualSeverity: row.residualSeverity,
      ...(row.additionalControls.trim()
        ? { additionalControls: row.additionalControls.trim() }
        : {}),
    };
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setServerError("");

    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const hazardInputs = hazards.map(toHazardInput);

    try {
      if (mode === "create") {
        const input: CreateRiskAssessmentInput = {
          title: title.trim(),
          projectId,
          ownerId,
          hazards: hazardInputs,
        };

        if (siteId) input.siteId = siteId;
        if (description.trim()) input.description = description.trim();
        if (reviewDate) {
          input.reviewDate = new Date(reviewDate).toISOString();
        }

        const result = await createAssessment.mutateAsync(input);
        router.push(riskAssessmentDetailHref(result.riskAssessment.id));
        return;
      }

      if (!assessment) {
        return;
      }

      const input: UpdateRiskAssessmentInput = {
        title: title.trim(),
        description: description.trim(),
        projectId,
        siteId: siteId || null,
        ownerId,
        reviewDate: reviewDate ? new Date(reviewDate).toISOString() : null,
        hazards: hazardInputs,
      };

      await updateAssessment.mutateAsync({ id: assessment.id, input });
      onDone?.();
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The risk assessment could not be saved. Please try again.",
      );
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-5"
    >
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {serverError}
        </p>
      )}

      <Card>
        <CardHeader
          title="Assessment details"
          description="Choose the scope and the person accountable for keeping this assessment current."
        />
        <CardBody>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Title"
                id="risk-title"
                value={title}
                error={errors.title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setErrors((current) => ({ ...current, title: "" }));
                }}
                maxLength={300}
                placeholder="e.g. Scaffold erection risk assessment"
              />

              <TextField
                label="Review date (optional)"
                id="risk-review-date"
                type="date"
                value={reviewDate}
                onChange={(event) => setReviewDate(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Project"
                id="risk-project"
                value={projectId}
                error={errors.projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setSiteId("");
                  setErrors((current) => ({ ...current, projectId: "" }));
                }}
                options={[
                  { value: "", label: "Choose a project" },
                  ...(projects.data?.projects ?? []).map((project) => ({
                    value: project.id,
                    label: `${project.name} · ${project.code}`,
                  })),
                ]}
                disabled={projects.isLoading}
              />

              <SelectField
                label="Site (optional)"
                id="risk-site"
                value={siteId}
                hint="Leave blank for a project-level assessment."
                onChange={(event) => setSiteId(event.target.value)}
                options={[
                  { value: "", label: "No specific site" },
                  ...(projectSites.data?.sites ?? []).map((site) => ({
                    value: site.id,
                    label: `${site.name} · ${site.code}`,
                  })),
                ]}
                disabled={!projectId || projectSites.isLoading}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Owner"
                id="risk-owner"
                value={ownerId}
                error={errors.ownerId}
                onChange={(event) => {
                  setOwnerId(event.target.value);
                  setErrors((current) => ({ ...current, ownerId: "" }));
                }}
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
            </div>

            <TextareaField
              label="Scope and description (optional)"
              id="risk-description"
              value={description}
              error={errors.description}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrors((current) => ({ ...current, description: "" }));
              }}
              rows={4}
              maxLength={5000}
              placeholder="What activity, area or equipment does this assessment cover?"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Hazards"
          description="Rate likelihood and severity from 1 to 5. Risk bands are derived by the server from those scores."
        />
        <CardBody className="space-y-4">
          {errors.hazards && (
            <p role="alert" className="text-sm text-red-700">
              {errors.hazards}
            </p>
          )}

          {hazards.map((row, index) => {
            const inherentLevel = riskLevelFor(row.likelihood, row.severity);
            const residualLevel = riskLevelFor(
              row.residualLikelihood,
              row.residualSeverity,
            );

            return (
              <div
                key={row.key}
                className="space-y-4 rounded-lg border border-line bg-navy-50/20 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Hazard {index + 1}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setHazards((current) =>
                        current.filter((item) => item.key !== row.key),
                      )
                    }
                    disabled={hazards.length === 1}
                  >
                    Remove
                  </Button>
                </div>

                <TextField
                  label="Hazard"
                  id={`risk-hazard-${row.key}`}
                  value={row.hazard}
                  error={errors[`${row.key}.hazard`]}
                  onChange={(event) => {
                    updateHazard(row.key, { hazard: event.target.value });
                    setErrors((current) => ({
                      ...current,
                      [`${row.key}.hazard`]: "",
                    }));
                  }}
                  maxLength={500}
                  placeholder="e.g. Working at height without edge protection"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <TextareaField
                    label="Potential consequences"
                    id={`risk-consequences-${row.key}`}
                    value={row.consequences}
                    error={errors[`${row.key}.consequences`]}
                    onChange={(event) =>
                      updateHazard(row.key, {
                        consequences: event.target.value,
                      })
                    }
                    rows={2}
                    maxLength={2000}
                    placeholder="What could happen?"
                  />
                  <TextareaField
                    label="Existing controls"
                    id={`risk-controls-${row.key}`}
                    value={row.existingControls}
                    error={errors[`${row.key}.existingControls`]}
                    onChange={(event) =>
                      updateHazard(row.key, {
                        existingControls: event.target.value,
                      })
                    }
                    rows={2}
                    maxLength={2000}
                    placeholder="Controls already in place"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
                  <SelectField
                    label="Inherent likelihood"
                    id={`risk-likelihood-${row.key}`}
                    value={String(row.likelihood)}
                    onChange={(event) =>
                      updateHazard(row.key, {
                        likelihood: Number(event.target.value),
                      })
                    }
                    options={SCORE_OPTIONS}
                  />
                  <SelectField
                    label="Inherent severity"
                    id={`risk-severity-${row.key}`}
                    value={String(row.severity)}
                    onChange={(event) =>
                      updateHazard(row.key, {
                        severity: Number(event.target.value),
                      })
                    }
                    options={SCORE_OPTIONS}
                  />
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      Inherent risk
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskLevelBadge level={inherentLevel} />
                      <span className="text-xs text-muted">
                        Score {riskScore(row.likelihood, row.severity)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
                  <SelectField
                    label="Residual likelihood"
                    id={`risk-residual-likelihood-${row.key}`}
                    value={String(row.residualLikelihood)}
                    onChange={(event) =>
                      updateHazard(row.key, {
                        residualLikelihood: Number(event.target.value),
                      })
                    }
                    options={SCORE_OPTIONS}
                  />
                  <SelectField
                    label="Residual severity"
                    id={`risk-residual-severity-${row.key}`}
                    value={String(row.residualSeverity)}
                    onChange={(event) =>
                      updateHazard(row.key, {
                        residualSeverity: Number(event.target.value),
                      })
                    }
                    options={SCORE_OPTIONS}
                  />
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      Residual risk
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskLevelBadge level={residualLevel} />
                      <span className="text-xs text-muted">
                        Score{" "}
                        {riskScore(
                          row.residualLikelihood,
                          row.residualSeverity,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <TextareaField
                  label="Additional controls (optional)"
                  id={`risk-additional-${row.key}`}
                  value={row.additionalControls}
                  error={errors[`${row.key}.additionalControls`]}
                  onChange={(event) =>
                    updateHazard(row.key, {
                      additionalControls: event.target.value,
                    })
                  }
                  rows={2}
                  maxLength={2000}
                  placeholder="Controls needed to reach the residual rating"
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setHazards((current) =>
                  current.length >= MAX_RISK_HAZARDS
                    ? current
                    : [...current, blankHazardRow()],
                )
              }
              disabled={hazards.length >= MAX_RISK_HAZARDS}
            >
              Add hazard
            </Button>
            <Badge tone="neutral">
              {hazards.length} hazard{hazards.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardBody>
      </Card>

      {assignees.isError && (
        <p role="alert" className="text-sm text-red-700">
          Unable to load assignable owners.{" "}
          {assignees.error instanceof Error
            ? assignees.error.message
            : "Please try again."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" isLoading={pending}>
          {mode === "create" ? "Create draft" : "Save changes"}
        </Button>
        {mode === "create" ? (
          <Link
            href="/risk-assessments"
            className={buttonStyles("secondary")}
          >
            Cancel
          </Link>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
