"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import {
  useCorrectiveActionAssignees,
  useUpdateCorrectiveAction,
} from "@/lib/api/corrective-actions";
import { useProjects, useSites } from "@/lib/api/worksites";
import type { CorrectiveActionSummary } from "@/lib/api/types";

/**
 * Metadata editor for HSE management. Incident-linked actions cannot move
 * project or site, so those controls are replaced with an explanatory note;
 * the API enforces the same rule.
 */
export function CorrectiveActionEditPanel({
  action,
  onDone,
  onCancel,
}: {
  action: CorrectiveActionSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const updateAction = useUpdateCorrectiveAction();
  const assignees = useCorrectiveActionAssignees();
  const projects = useProjects();

  const [description, setDescription] = useState(action.description);
  const [dueDate, setDueDate] = useState(action.dueDate.slice(0, 10));
  const [assignedTo, setAssignedTo] = useState(action.assignedTo.id);
  const [projectId, setProjectId] = useState(action.project.id);
  const [siteId, setSiteId] = useState(action.site?.id ?? "");
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");

  const incidentLinked = action.incident !== null;
  const sites = useSites({ projectId, page: 1, limit: 100 });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError("");
    setServerError("");

    if (!description.trim()) {
      setError("Describe the corrective action.");
      return;
    }

    if (!dueDate) {
      setError("Choose a due date.");
      return;
    }

    if (!assignedTo) {
      setError("Assign this action to an HSE user.");
      return;
    }

    if (!incidentLinked && action.site !== null && !siteId) {
      setError("Choose a site for the selected project.");
      return;
    }

    try {
      await updateAction.mutateAsync({
        id: action.id,
        input: {
          description: description.trim(),
          dueDate: new Date(`${dueDate}T00:00:00.000Z`).toISOString(),
          assignedTo,
          ...(incidentLinked
            ? {}
            : { projectId, siteId: siteId || undefined }),
        },
      });
      onDone();
    } catch (updateError) {
      setServerError(
        updateError instanceof Error
          ? updateError.message
          : "The action could not be updated.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Edit action details"
        description="Reassign ownership, adjust the due date or correct the description."
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
            label="Corrective action"
            id="capa-edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={5000}
          />

          {incidentLinked ? (
            <p className="rounded-lg border border-line bg-navy-50/40 px-4 py-3 text-xs leading-5 text-muted">
              Project and site are derived from the linked incident and cannot
              be changed.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Project"
                id="capa-edit-project"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setSiteId("");
                }}
                options={(projects.data?.projects ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.name} · ${project.code}`,
                }))}
              />

              <SelectField
                label="Site (optional)"
                id="capa-edit-site"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                options={[
                  {
                    value: "",
                    label: action.site
                      ? "Choose a site"
                      : "No specific site",
                  },
                  ...(sites.data?.sites ?? []).map((site) => ({
                    value: site.id,
                    label: `${site.name} · ${site.code}`,
                  })),
                ]}
                disabled={!projectId || sites.isLoading}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Assignee"
              id="capa-edit-assignee"
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
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
              id="capa-edit-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={updateAction.isPending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={updateAction.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
