"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonStyles } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  useCreatePermit,
  usePermitAssignees,
  useUpdatePermit,
} from "@/lib/api/permits";
import { useProjects, useSites } from "@/lib/api/worksites";
import {
  PERMIT_PRECAUTIONS,
  PERMIT_TO_WORK_TYPES,
  type CreatePermitInput,
  type PermitLinkedRiskAssessment,
  type PermitPrecaution,
  type PermitSummary,
  type PermitWorkType,
  type UpdatePermitInput,
} from "@/lib/api/types";
import {
  MAX_LINKED_RISK_ASSESSMENTS,
  permitDetailHref,
  parseWorkersInvolved,
} from "@/lib/permits";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { PermitRiskAssessmentSelector } from "./permit-risk-assessment-selector";

interface HazardRow {
  key: string;
  hazard: string;
  controlMeasures: string;
}

let hazardKeySeed = 0;

function nextHazardKey(): string {
  hazardKeySeed += 1;
  return `permit-hazard-${Date.now()}-${hazardKeySeed}`;
}

function emptyHazardRow(): HazardRow {
  return { key: nextHazardKey(), hazard: "", controlMeasures: "" };
}

/** Converts an ISO timestamp into the value shape `datetime-local` expects. */
function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

interface PermitFormProps {
  /** When supplied the form edits an existing DRAFT permit. */
  permit?: PermitSummary;
  onDone?: () => void;
  onCancel?: () => void;
}

/**
 * Permit editor used for both creation and DRAFT updates. The server re-checks
 * the site, responsible person, validity window and every hazard line; this
 * form only provides immediate feedback.
 */
export function PermitForm({ permit, onDone, onCancel }: PermitFormProps) {
  const router = useRouter();
  const createPermit = useCreatePermit();
  const updatePermit = useUpdatePermit();
  const projects = useProjects();
  const sites = useSites({ page: 1, limit: 100 });

  const [workDescription, setWorkDescription] = useState(
    permit?.workDescription ?? "",
  );
  const [workType, setWorkType] = useState<PermitWorkType>(
    permit?.workType ?? "COLD_WORK",
  );
  const [projectId, setProjectId] = useState(permit?.project.id ?? "");
  const [siteId, setSiteId] = useState(permit?.site.id ?? "");
  const [location, setLocation] = useState(permit?.location ?? "");
  const [validFrom, setValidFrom] = useState(
    toDateTimeLocal(permit?.validFrom),
  );
  const [validTo, setValidTo] = useState(toDateTimeLocal(permit?.validTo));
  const [responsiblePersonId, setResponsiblePersonId] = useState(
    permit?.responsiblePerson?.id ?? "",
  );
  const [workersText, setWorkersText] = useState(
    (permit?.workersInvolved ?? []).join("\n"),
  );
  const [precautions, setPrecautions] = useState<PermitPrecaution[]>(
    permit?.requiredPrecautions ?? [],
  );
  const [hazards, setHazards] = useState<HazardRow[]>(
    permit && permit.hazards.length > 0
      ? permit.hazards.map((hazard) => ({
          key: hazard.id || nextHazardKey(),
          hazard: hazard.hazard,
          controlMeasures: hazard.controlMeasures,
        }))
      : [emptyHazardRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [linkedRiskAssessments, setLinkedRiskAssessments] = useState<
    PermitLinkedRiskAssessment[]
  >(permit?.linkedRiskAssessments ?? []);

  const assignees = usePermitAssignees(siteId);

  const projectSites = (sites.data?.sites ?? []).filter(
    (site) => !projectId || site.project.id === projectId,
  );

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!workDescription.trim()) {
      nextErrors.workDescription = "Describe the work to be carried out.";
    } else if (workDescription.trim().length > 5000) {
      nextErrors.workDescription = "Keep the description under 5,000 characters.";
    }

    if (!projectId) {
      nextErrors.projectId = "Choose a project.";
    }

    if (!siteId) {
      nextErrors.siteId = "Choose an active site for the work.";
    }

    if (!validFrom) {
      nextErrors.validFrom = "Choose when the permit becomes valid.";
    } else if (!Number.isFinite(new Date(validFrom).getTime())) {
      nextErrors.validFrom = "Enter a valid start date and time.";
    }

    if (!validTo) {
      nextErrors.validTo = "Choose when the permit expires.";
    } else if (!Number.isFinite(new Date(validTo).getTime())) {
      nextErrors.validTo = "Enter a valid end date and time.";
    } else if (
      validFrom &&
      Number.isFinite(new Date(validFrom).getTime()) &&
      new Date(validTo).getTime() <= new Date(validFrom).getTime()
    ) {
      nextErrors.validTo = "Validity must end after it starts.";
    }

    if (!responsiblePersonId) {
      nextErrors.responsiblePersonId = "Choose a responsible person.";
    }

    const workers = parseWorkersInvolved(workersText);

    if (workers.length === 0) {
      nextErrors.workersInvolved = "List at least one worker covered by the permit.";
    } else if (workers.length > 50) {
      nextErrors.workersInvolved = "List no more than 50 workers.";
    }

    if (precautions.length === 0) {
      nextErrors.requiredPrecautions = "Select at least one required precaution.";
    }

    if (
      hazards.length === 0 ||
      hazards.some(
        (hazard) => !hazard.hazard.trim() || !hazard.controlMeasures.trim(),
      )
    ) {
      nextErrors.hazards =
        "Every hazard needs a description and its control measures.";
    }

    if (location.trim().length > 300) {
      nextErrors.location = "Keep the location under 300 characters.";
    }

    if (linkedRiskAssessments.length > MAX_LINKED_RISK_ASSESSMENTS) {
      nextErrors.linkedRiskAssessments = `Link no more than ${MAX_LINKED_RISK_ASSESSMENTS} risk assessments.`;
    }

    return nextErrors;
  }

  function togglePrecaution(precaution: PermitPrecaution): void {
    setPrecautions((current) =>
      current.includes(precaution)
        ? current.filter((value) => value !== precaution)
        : [...current, precaution],
    );
    setErrors((current) => ({ ...current, requiredPrecautions: "" }));
  }

  function updateHazard(
    key: string,
    partial: Partial<Pick<HazardRow, "hazard" | "controlMeasures">>,
  ): void {
    setHazards((current) =>
      current.map((hazard) =>
        hazard.key === key ? { ...hazard, ...partial } : hazard,
      ),
    );
    setErrors((current) => ({ ...current, hazards: "" }));
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

    const input: CreatePermitInput = {
      workDescription: workDescription.trim(),
      workType,
      projectId,
      siteId,
      validFrom: new Date(validFrom).toISOString(),
      validTo: new Date(validTo).toISOString(),
      responsiblePersonId,
      workersInvolved: parseWorkersInvolved(workersText),
      requiredPrecautions: precautions,
      hazards: hazards.map((hazard) => ({
        hazard: hazard.hazard.trim(),
        controlMeasures: hazard.controlMeasures.trim(),
      })),
      riskAssessmentIds: linkedRiskAssessments.map(
        (assessment) => assessment.id,
      ),
    };

    if (location.trim()) {
      input.location = location.trim();
    }

    try {
      if (permit) {
        // An empty location is meaningful when editing: it clears the field.
        const update: UpdatePermitInput = {
          ...input,
          location: location.trim(),
        };
        await updatePermit.mutateAsync({ id: permit.id, input: update });
        onDone?.();
      } else {
        const result = await createPermit.mutateAsync(input);
        router.push(permitDetailHref(result.permit.id));
      }
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The permit could not be saved. Please try again.",
      );
    }
  }

  const isPending = createPermit.isPending || updatePermit.isPending;

  return (
    <Card>
      <CardHeader
        title={permit ? "Edit draft permit" : "Permit details"}
        description="Choose the site, validity window and responsible person, then record the workers, precautions and hazard controls."
      />
      <CardBody>
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

          <TextareaField
            label="Work description"
            id="permit-work-description"
            value={workDescription}
            error={errors.workDescription}
            onChange={(event) => {
              setWorkDescription(event.target.value);
              setErrors((current) => ({ ...current, workDescription: "" }));
            }}
            rows={4}
            maxLength={5000}
            placeholder="Describe the task, equipment and scope of work."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Work type"
              id="permit-work-type"
              value={workType}
              onChange={(event) =>
                setWorkType(event.target.value as PermitWorkType)
              }
              options={PERMIT_TO_WORK_TYPES.map((type) => ({
                value: type,
                label: formatHseLabel(type),
              }))}
            />

            <TextField
              label="Specific location (optional)"
              id="permit-location"
              value={location}
              error={errors.location}
              onChange={(event) => {
                setLocation(event.target.value);
                setErrors((current) => ({ ...current, location: "" }));
              }}
              maxLength={300}
              placeholder="e.g. Tank farm, bay 3"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Project"
              id="permit-project"
              value={projectId}
              error={errors.projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setSiteId("");
                setResponsiblePersonId("");
                setLinkedRiskAssessments([]);
                setErrors((current) => ({
                  ...current,
                  projectId: "",
                  siteId: "",
                }));
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
              label="Site"
              id="permit-site"
              value={siteId}
              error={errors.siteId}
              hint="Only active sites assigned to you are available."
              onChange={(event) => {
                setSiteId(event.target.value);
                setResponsiblePersonId("");
                setLinkedRiskAssessments([]);
                setErrors((current) => ({
                  ...current,
                  siteId: "",
                  responsiblePersonId: "",
                }));
              }}
              options={[
                { value: "", label: "Choose a site" },
                ...projectSites.map((site) => ({
                  value: site.id,
                  label: `${site.name} · ${site.code}`,
                })),
              ]}
              disabled={!projectId || sites.isLoading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Valid from"
              id="permit-valid-from"
              type="datetime-local"
              value={validFrom}
              error={errors.validFrom}
              onChange={(event) => {
                setValidFrom(event.target.value);
                setErrors((current) => ({ ...current, validFrom: "" }));
              }}
            />

            <TextField
              label="Valid to"
              id="permit-valid-to"
              type="datetime-local"
              value={validTo}
              error={errors.validTo}
              onChange={(event) => {
                setValidTo(event.target.value);
                setErrors((current) => ({ ...current, validTo: "" }));
              }}
            />
          </div>

          <SelectField
            label="Responsible person"
            id="permit-responsible-person"
            value={responsiblePersonId}
            error={errors.responsiblePersonId}
            hint="Active supervisors, HSE officers, managers or admins authorised for the site."
            onChange={(event) => {
              setResponsiblePersonId(event.target.value);
              setErrors((current) => ({
                ...current,
                responsiblePersonId: "",
              }));
            }}
            options={[
              { value: "", label: "Choose a responsible person" },
              ...(assignees.data?.assignees ?? []).map((assignee) => ({
                value: assignee.id,
                label:
                  `${assignee.firstName} ${assignee.lastName}`.trim() ||
                  assignee.id,
              })),
            ]}
            disabled={!siteId || assignees.isLoading}
          />

          <PermitRiskAssessmentSelector
            projectId={projectId}
            siteId={siteId}
            selected={linkedRiskAssessments}
            onChange={setLinkedRiskAssessments}
            error={errors.linkedRiskAssessments}
          />

          <TextareaField
            label="Workers involved"
            id="permit-workers"
            value={workersText}
            error={errors.workersInvolved}
            hint="One worker name and role per line, for example: John Doe — welder."
            onChange={(event) => {
              setWorkersText(event.target.value);
              setErrors((current) => ({ ...current, workersInvolved: "" }));
            }}
            rows={4}
            maxLength={5000}
          />

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Required precautions
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMIT_PRECAUTIONS.map((precaution) => (
                <label
                  key={precaution}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={precautions.includes(precaution)}
                    onChange={() => togglePrecaution(precaution)}
                    className="h-4 w-4 rounded border-line text-navy-700 focus:ring-navy-600"
                  />
                  {formatHseLabel(precaution)}
                </label>
              ))}
            </div>
            {errors.requiredPrecautions && (
              <p role="alert" className="text-xs text-red-600">
                {errors.requiredPrecautions}
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Hazard identification and controls
            </legend>

            {hazards.map((hazard, index) => (
              <div
                key={hazard.key}
                className="space-y-3 rounded-lg border border-line bg-navy-50/30 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    Hazard {index + 1}
                  </p>
                  {hazards.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setHazards((current) =>
                          current.filter((row) => row.key !== hazard.key),
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <TextField
                  label="Hazard"
                  id={`permit-hazard-${hazard.key}`}
                  value={hazard.hazard}
                  onChange={(event) =>
                    updateHazard(hazard.key, { hazard: event.target.value })
                  }
                  maxLength={500}
                  placeholder="What could cause harm?"
                />

                <TextareaField
                  label="Control measures"
                  id={`permit-controls-${hazard.key}`}
                  value={hazard.controlMeasures}
                  onChange={(event) =>
                    updateHazard(hazard.key, {
                      controlMeasures: event.target.value,
                    })
                  }
                  rows={3}
                  maxLength={2000}
                  placeholder="How is the hazard controlled?"
                />
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setHazards((current) => [...current, emptyHazardRow()])
              }
            >
              Add hazard
            </Button>

            {errors.hazards && (
              <p role="alert" className="text-xs text-red-600">
                {errors.hazards}
              </p>
            )}
          </fieldset>

          {assignees.isError && (
            <p role="alert" className="text-sm text-red-700">
              Unable to load eligible responsible people.{" "}
              {assignees.error instanceof Error
                ? assignees.error.message
                : "Please try again."}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={isPending}>
              {permit ? "Save draft" : "Raise permit"}
            </Button>
            {onCancel ? (
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/permits" className={buttonStyles("secondary")}>
                Cancel
              </Link>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
