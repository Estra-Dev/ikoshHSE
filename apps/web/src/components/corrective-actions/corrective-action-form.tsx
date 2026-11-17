"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonStyles } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  useCorrectiveActionAssignees,
  useCreateCorrectiveAction,
} from "@/lib/api/corrective-actions";
import { useIncidents } from "@/lib/api/incidents";
import { useProjects, useSites } from "@/lib/api/worksites";
import type {
  CorrectiveActionSource,
  CreateCorrectiveActionInput,
} from "@/lib/api/types";
import { correctiveActionDetailHref } from "@/lib/corrective-actions";
import { formatUtcDate } from "@/lib/dashboard-format";

interface CorrectiveActionFormProps {
  initialSource?: CorrectiveActionSource;
  initialIncidentId?: string;
}

function isReportSource(source: CorrectiveActionSource): boolean {
  return source === "INCIDENT" || source === "NEAR_MISS";
}

/**
 * Creation form. Incident and near-miss actions send only the linked report;
 * project and site are derived by the API so provenance cannot diverge.
 * Manual sources require a project and allow an optional site.
 */
export function CorrectiveActionForm({
  initialSource,
  initialIncidentId,
}: CorrectiveActionFormProps) {
  const router = useRouter();
  const createAction = useCreateCorrectiveAction();
  const assignees = useCorrectiveActionAssignees();
  const projects = useProjects();

  const [source, setSource] = useState<CorrectiveActionSource>(
    initialSource ?? "INCIDENT",
  );
  const [incidentId, setIncidentId] = useState(initialIncidentId ?? "");
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const reportSource = isReportSource(source);
  const reportType =
    source === "INCIDENT" || source === "NEAR_MISS" ? source : undefined;
  const incidents = useIncidents({
    type: reportType,
    page: 1,
    limit: 100,
  });
  const sites = useSites({ projectId, page: 1, limit: 100 });

  const incidentOptions = useMemo(() => {
    const options = (incidents.data?.incidents ?? []).map((incident) => ({
      value: incident.id,
      label: `${incident.title} · ${formatUtcDate(incident.occurredAt)}`,
    }));

    // A prefilled report may sit outside the newest 100 results.
    if (
      incidentId &&
      !options.some((option) => option.value === incidentId)
    ) {
      options.unshift({
        value: incidentId,
        label: `Selected ${source === "NEAR_MISS" ? "near miss" : "incident"}`,
      });
    }

    return options;
  }, [incidents.data?.incidents, incidentId, source]);

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!description.trim()) {
      nextErrors.description = "Describe the corrective action.";
    } else if (description.trim().length > 5000) {
      nextErrors.description = "Keep the description under 5,000 characters.";
    }

    if (!dueDate) {
      nextErrors.dueDate = "Choose a due date.";
    } else if (!Number.isFinite(new Date(`${dueDate}T00:00:00.000Z`).getTime())) {
      nextErrors.dueDate = "Enter a valid due date.";
    }

    if (!assignedTo) {
      nextErrors.assignedTo = "Assign this action to an HSE user.";
    }

    if (reportSource && !incidentId) {
      nextErrors.incidentId = "Choose the linked report.";
    }

    if (!reportSource && !projectId) {
      nextErrors.projectId = "Choose a project.";
    }

    return nextErrors;
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

    const input: CreateCorrectiveActionInput = {
      description: description.trim(),
      source,
      assignedTo,
      dueDate: new Date(`${dueDate}T00:00:00.000Z`).toISOString(),
    };

    if (reportSource) {
      input.incidentId = incidentId;
    } else {
      input.projectId = projectId;
      if (siteId) {
        input.siteId = siteId;
      }
    }

    try {
      const result = await createAction.mutateAsync(input);
      router.push(correctiveActionDetailHref(result.correctiveAction.id));
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The corrective action could not be created. Please try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Action details"
        description="Incident and near-miss actions derive their project and site from the linked report. Manual actions require a project."
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

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Source"
              id="capa-source"
              value={source}
              hint="Where this action originates."
              onChange={(event) => {
                setSource(event.target.value as CorrectiveActionSource);
                setErrors({});
              }}
              options={[
                { value: "INCIDENT", label: "Incident" },
                { value: "NEAR_MISS", label: "Near miss" },
                { value: "HSE_OBSERVATION", label: "HSE observation" },
                { value: "OTHER", label: "Other" },
              ]}
            />

            {reportSource ? (
              <SelectField
                label="Linked report"
                id="capa-incident"
                value={incidentId}
                error={errors.incidentId}
                onChange={(event) => {
                  setIncidentId(event.target.value);
                  setErrors((current) => ({
                    ...current,
                    incidentId: "",
                  }));
                }}
                options={[
                  { value: "", label: "Choose a report" },
                  ...incidentOptions,
                ]}
                disabled={incidents.isLoading}
              />
            ) : (
              <SelectField
                label="Project"
                id="capa-project"
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
              />
            )}
          </div>

          {!reportSource && (
            <SelectField
              label="Site (optional)"
              id="capa-site"
              value={siteId}
              hint="Leave blank for a project-level action."
              onChange={(event) => setSiteId(event.target.value)}
              options={[
                { value: "", label: "No specific site" },
                ...(sites.data?.sites ?? []).map((site) => ({
                  value: site.id,
                  label: `${site.name} · ${site.code}`,
                })),
              ]}
              disabled={!projectId || sites.isLoading}
            />
          )}

          <TextareaField
            label="Corrective action"
            id="capa-description"
            value={description}
            error={errors.description}
            onChange={(event) => {
              setDescription(event.target.value);
              setErrors((current) => ({ ...current, description: "" }));
            }}
            rows={5}
            maxLength={5000}
            placeholder="What must be done to close this out?"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Assignee"
              id="capa-assignee"
              value={assignedTo}
              error={errors.assignedTo}
              onChange={(event) => {
                setAssignedTo(event.target.value);
                setErrors((current) => ({ ...current, assignedTo: "" }));
              }}
              options={[
                { value: "", label: "Choose an HSE user" },
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
              id="capa-due-date"
              type="date"
              value={dueDate}
              error={errors.dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                setErrors((current) => ({ ...current, dueDate: "" }));
              }}
            />
          </div>

          {assignees.isError && (
            <p role="alert" className="text-sm text-red-700">
              Unable to load assignable HSE staff.{" "}
              {assignees.error instanceof Error
                ? assignees.error.message
                : "Please try again."}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={createAction.isPending}>
              Create corrective action
            </Button>
            <Link
              href="/corrective-actions"
              className={buttonStyles("secondary")}
            >
              Cancel
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
