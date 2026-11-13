"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import {
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/fields";
import { useHseReference } from "@/lib/api/hse";
import { useCreateProject, useUpdateProject } from "@/lib/api/worksites";
import type { ProjectSummary } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  DEFAULT_PROJECT_STATUSES,
  toApiDate,
  toDateInputValue,
} from "@/lib/worksites";

/**
 * HSE project form. Pass `project` to edit an existing record, or `null` to
 * create a new one. Only HSE managers and administrators reach this form; the
 * API re-checks the role on every mutation.
 */
export function ProjectForm({
  project,
  onClose,
}: {
  project: ProjectSummary | null;
  onClose: () => void;
}) {
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const reference = useHseReference();

  const isEditing = project !== null;
  const mutation = isEditing ? updateProject : createProject;

  const [name, setName] = useState(project?.name ?? "");
  const [code, setCode] = useState(project?.code ?? "");
  const [client, setClient] = useState(project?.client ?? "");
  const [location, setLocation] = useState(project?.location ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState(project?.status ?? "ACTIVE");
  const [startDate, setStartDate] = useState(
    toDateInputValue(project?.startDate),
  );
  const [endDate, setEndDate] = useState(toDateInputValue(project?.endDate));

  const statuses =
    reference.data?.data.projectStatuses ?? DEFAULT_PROJECT_STATUSES;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = {
      name: name.trim(),
      code: code.trim(),
      description: description.trim(),
      status,
      startDate: toApiDate(startDate),
      endDate: toApiDate(endDate),
      ...(client.trim()
        ? { client: client.trim() }
        : isEditing
          ? { client: null }
          : {}),
      ...(location.trim()
        ? { location: location.trim() }
        : isEditing
          ? { location: null }
          : {}),
    };

    try {
      if (isEditing && project) {
        await updateProject.mutateAsync({ id: project.id, input });
      } else {
        await createProject.mutateAsync(input);
      }
      onClose();
    } catch {
      // The mutation error is rendered below; keep the form open for correction.
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">
        {isEditing ? `Edit ${project?.name}` : "New project"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Projects group physical work sites. Names and codes must be unique.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          id="project-name"
          type="text"
          required
          placeholder="e.g. Bonny Terminal Expansion"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Code"
          id="project-code"
          type="text"
          required
          placeholder="e.g. BTE-01"
          value={code}
          maxLength={32}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <TextField
          label="Client"
          id="project-client"
          type="text"
          placeholder="Client organisation"
          value={client}
          maxLength={100}
          onChange={(event) => setClient(event.target.value)}
        />
        <TextField
          label="Location"
          id="project-location"
          type="text"
          placeholder="Project location"
          value={location}
          maxLength={150}
          onChange={(event) => setLocation(event.target.value)}
        />
        <SelectField
          label="Lifecycle status"
          id="project-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={statuses.map((value) => ({
            value,
            label: formatHseLabel(value),
          }))}
        />
        <div className="hidden sm:block" />
        <TextField
          label="Start date"
          id="project-start-date"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <TextField
          label="End date"
          id="project-end-date"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <div className="sm:col-span-2">
          <TextareaField
            label="Description"
            id="project-description"
            rows={3}
            placeholder="Scope or HSE context for this project"
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" isLoading={mutation.isPending}>
            {isEditing ? "Save project" : "Create project"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600 sm:col-span-2" role="alert">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Unable to save the project."}
          </p>
        )}
      </form>
    </section>
  );
}
