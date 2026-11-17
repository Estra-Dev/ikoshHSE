"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonStyles } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  useCreateInspection,
  useInspectionAssignees,
} from "@/lib/api/inspections";
import { useProjects, useSites } from "@/lib/api/worksites";
import type { CreateInspectionInput, InspectionType } from "@/lib/api/types";
import { inspectionDetailHref } from "@/lib/inspections";

/**
 * Inspection scheduling form. The project is mandatory; a site is optional but
 * must belong to the project. The API re-validates the pair and requires an
 * active HSE inspector.
 */
export function InspectionForm() {
  const router = useRouter();
  const createInspection = useCreateInspection();
  const assignees = useInspectionAssignees();
  const projects = useProjects();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<InspectionType>("ROUTINE");
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [inspectorId, setInspectorId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const projectSites = useSites({ projectId, page: 1, limit: 100 });

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!title.trim()) {
      nextErrors.title = "Give this inspection a title.";
    } else if (title.trim().length > 300) {
      nextErrors.title = "Keep the title under 300 characters.";
    }

    if (!projectId) {
      nextErrors.projectId = "Choose a project.";
    }

    if (!inspectorId) {
      nextErrors.inspectorId = "Assign an HSE inspector.";
    }

    if (!scheduledFor) {
      nextErrors.scheduledFor = "Choose when the inspection is scheduled.";
    } else if (!Number.isFinite(new Date(scheduledFor).getTime())) {
      nextErrors.scheduledFor = "Enter a valid date and time.";
    }

    if (description.trim().length > 5000) {
      nextErrors.description = "Keep the description under 5,000 characters.";
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

    const input: CreateInspectionInput = {
      title: title.trim(),
      type,
      projectId,
      inspectorId,
      scheduledFor: new Date(scheduledFor).toISOString(),
    };

    if (siteId) {
      input.siteId = siteId;
    }

    if (description.trim()) {
      input.description = description.trim();
    }

    try {
      const result = await createInspection.mutateAsync(input);
      router.push(inspectionDetailHref(result.inspection.id));
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The inspection could not be scheduled. Please try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Inspection schedule"
        description="Choose the scope, responsible inspector and date. Findings are recorded when the inspection is conducted."
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
            <TextField
              label="Title"
              id="inspection-title"
              value={title}
              error={errors.title}
              onChange={(event) => {
                setTitle(event.target.value);
                setErrors((current) => ({ ...current, title: "" }));
              }}
              maxLength={300}
              placeholder="e.g. Monthly scaffold inspection"
            />

            <SelectField
              label="Type"
              id="inspection-type"
              value={type}
              onChange={(event) => setType(event.target.value as InspectionType)}
              options={[
                { value: "ROUTINE", label: "Routine" },
                { value: "FOCUSED", label: "Focused" },
                { value: "FOLLOW_UP", label: "Follow-up" },
              ]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Project"
              id="inspection-project"
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
              id="inspection-site"
              value={siteId}
              hint="Leave blank for a project-level inspection."
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
              label="Inspector"
              id="inspection-inspector"
              value={inspectorId}
              error={errors.inspectorId}
              onChange={(event) => {
                setInspectorId(event.target.value);
                setErrors((current) => ({ ...current, inspectorId: "" }));
              }}
              options={[
                { value: "", label: "Choose an HSE inspector" },
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
              label="Scheduled for"
              id="inspection-scheduled-for"
              type="datetime-local"
              value={scheduledFor}
              error={errors.scheduledFor}
              onChange={(event) => {
                setScheduledFor(event.target.value);
                setErrors((current) => ({ ...current, scheduledFor: "" }));
              }}
            />
          </div>

          <TextareaField
            label="Scope and description (optional)"
            id="inspection-description"
            value={description}
            error={errors.description}
            onChange={(event) => {
              setDescription(event.target.value);
              setErrors((current) => ({ ...current, description: "" }));
            }}
            rows={4}
            maxLength={5000}
            placeholder="What areas, activities or equipment will be inspected?"
          />

          {assignees.isError && (
            <p role="alert" className="text-sm text-red-700">
              Unable to load assignable HSE inspectors.{" "}
              {assignees.error instanceof Error
                ? assignees.error.message
                : "Please try again."}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={createInspection.isPending}>
              Schedule inspection
            </Button>
            <Link href="/inspections" className={buttonStyles("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
