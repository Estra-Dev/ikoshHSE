"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  useInspectionAssignees,
  useUpdateInspection,
} from "@/lib/api/inspections";
import { useProjects, useSites } from "@/lib/api/worksites";
import type {
  InspectionSummary,
  InspectionType,
  UpdateInspectionInput,
} from "@/lib/api/types";

/** Formats an ISO timestamp for a `datetime-local` input in local time. */
function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Management metadata editor. Project and site are locked once a finding has a
 * linked corrective action, because that action derives its provenance from
 * this inspection.
 */
export function InspectionEditPanel({
  inspection,
  onDone,
  onCancel,
}: {
  inspection: InspectionSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const updateInspection = useUpdateInspection();
  const assignees = useInspectionAssignees();
  const projects = useProjects();

  const [title, setTitle] = useState(inspection.title);
  const [type, setType] = useState<InspectionType>(inspection.type);
  const [projectId, setProjectId] = useState(inspection.project.id);
  const [siteId, setSiteId] = useState(inspection.site?.id ?? "");
  const [inspectorId, setInspectorId] = useState(inspection.inspector.id);
  const [scheduledFor, setScheduledFor] = useState(
    toLocalDateTimeInput(inspection.scheduledFor),
  );
  const [description, setDescription] = useState(inspection.description);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const sites = useSites({ projectId, page: 1, limit: 100 });
  const provenanceLocked = inspection.findings.some(
    (finding) => finding.correctiveAction !== null,
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");

    const nextErrors: Record<string, string> = {};

    if (!title.trim()) {
      nextErrors.title = "Give this inspection a title.";
    }

    if (!scheduledFor || !Number.isFinite(new Date(scheduledFor).getTime())) {
      nextErrors.scheduledFor = "Enter a valid date and time.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const input: UpdateInspectionInput = {
      title: title.trim(),
      type,
      scheduledFor: new Date(scheduledFor).toISOString(),
      description: description.trim(),
    };

    if (!provenanceLocked) {
      if (projectId !== inspection.project.id) {
        input.projectId = projectId;
      }

      const originalSiteId = inspection.site?.id ?? "";

      if (siteId !== originalSiteId) {
        input.siteId = siteId === "" ? null : siteId;
      }
    }

    if (inspectorId !== inspection.inspector.id) {
      input.inspectorId = inspectorId;
    }

    try {
      await updateInspection.mutateAsync({ id: inspection.id, input });
      onDone();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The inspection could not be updated.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Edit schedule"
        description="Update ownership or timing before the inspection is completed."
      />
      <CardBody>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-5"
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Title"
              id="inspection-edit-title"
              value={title}
              error={fieldErrors.title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={300}
            />

            <SelectField
              label="Type"
              id="inspection-edit-type"
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
              id="inspection-edit-project"
              value={projectId}
              hint={
                provenanceLocked
                  ? "Locked because a finding is linked to a corrective action."
                  : undefined
              }
              onChange={(event) => {
                setProjectId(event.target.value);
                setSiteId("");
              }}
              options={(projects.data?.projects ?? []).map((project) => ({
                value: project.id,
                label: `${project.name} · ${project.code}`,
              }))}
              disabled={provenanceLocked || projects.isLoading}
            />

            <SelectField
              label="Site (optional)"
              id="inspection-edit-site"
              value={siteId}
              hint={
                provenanceLocked
                  ? "Locked because a finding is linked to a corrective action."
                  : "Leave blank for a project-level inspection."
              }
              onChange={(event) => setSiteId(event.target.value)}
              options={[
                { value: "", label: "No specific site" },
                ...(sites.data?.sites ?? []).map((site) => ({
                  value: site.id,
                  label: `${site.name} · ${site.code}`,
                })),
              ]}
              disabled={provenanceLocked || sites.isLoading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Inspector"
              id="inspection-edit-inspector"
              value={inspectorId}
              onChange={(event) => setInspectorId(event.target.value)}
              options={(assignees.data?.assignees ?? []).map((assignee) => ({
                value: assignee.id,
                label:
                  `${assignee.firstName} ${assignee.lastName}`.trim() ||
                  assignee.id,
              }))}
              disabled={assignees.isLoading}
            />

            <TextField
              label="Scheduled for"
              id="inspection-edit-scheduled-for"
              type="datetime-local"
              value={scheduledFor}
              error={fieldErrors.scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
            />
          </div>

          <TextareaField
            label="Scope and description"
            id="inspection-edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={5000}
          />

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={updateInspection.isPending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={updateInspection.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
