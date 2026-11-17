"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { useAuditAssignees, useUpdateAudit } from "@/lib/api/audits";
import { useProjects, useSites } from "@/lib/api/worksites";
import type {
  AuditType,
  HseAuditSummary,
  UpdateHseAuditInput,
} from "@/lib/api/types";
import { toDateTimeLocalValue } from "@/lib/incident-form";

interface AuditEditPanelProps {
  audit: HseAuditSummary;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Management metadata edits. Project and site are locked once a finding is
 * linked to a corrective action; the API returns 409 for that change.
 */
export function AuditEditPanel({
  audit,
  onDone,
  onCancel,
}: AuditEditPanelProps) {
  const updateAudit = useUpdateAudit();
  const assignees = useAuditAssignees();
  const projects = useProjects();

  const [title, setTitle] = useState(audit.title);
  const [type, setType] = useState<AuditType>(audit.type);
  const [projectId, setProjectId] = useState(audit.project.id);
  const [siteId, setSiteId] = useState(audit.site?.id ?? "");
  const [auditorIds, setAuditorIds] = useState<string[]>(
    audit.auditors.map((auditor) => auditor.id),
  );
  const [scheduledFor, setScheduledFor] = useState(
    toDateTimeLocalValue(audit.scheduledFor),
  );
  const [description, setDescription] = useState(audit.description);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const projectSites = useSites({ projectId, page: 1, limit: 100 });
  const auditorOptions = assignees.data?.assignees ?? [];

  function toggleAuditor(auditorId: string): void {
    setAuditorIds((current) =>
      current.includes(auditorId)
        ? current.filter((id) => id !== auditorId)
        : [...current, auditorId],
    );
    setErrors((current) => ({ ...current, auditorIds: "" }));
  }

  function validate(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (!title.trim()) {
      nextErrors.title = "Give this audit a title.";
    } else if (title.trim().length > 300) {
      nextErrors.title = "Keep the title under 300 characters.";
    }

    if (!projectId) {
      nextErrors.projectId = "Choose a project.";
    }

    if (auditorIds.length === 0) {
      nextErrors.auditorIds = "Assign at least one HSE auditor.";
    }

    if (!scheduledFor) {
      nextErrors.scheduledFor = "Choose when the audit is scheduled.";
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

    const input: UpdateHseAuditInput = {
      title: title.trim(),
      type,
      projectId,
      siteId: siteId || null,
      auditorIds,
      scheduledFor: new Date(scheduledFor).toISOString(),
      description: description.trim(),
    };

    try {
      await updateAudit.mutateAsync({ id: audit.id, input });
      onDone();
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The audit could not be updated. Please try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Edit audit schedule"
        description="Update the scope, date or auditors. Project and site are locked once a finding is linked to a corrective action."
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
              id="audit-edit-title"
              value={title}
              error={errors.title}
              onChange={(event) => {
                setTitle(event.target.value);
                setErrors((current) => ({ ...current, title: "" }));
              }}
              maxLength={300}
            />

            <SelectField
              label="Type"
              id="audit-edit-type"
              value={type}
              onChange={(event) => setType(event.target.value as AuditType)}
              options={[
                { value: "INTERNAL", label: "Internal" },
                { value: "EXTERNAL", label: "External" },
                { value: "SUPPLIER", label: "Supplier" },
                { value: "CERTIFICATION", label: "Certification" },
              ]}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Project"
              id="audit-edit-project"
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
              id="audit-edit-site"
              value={siteId}
              hint="Leave blank for a project-level audit."
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

          <TextField
            label="Scheduled for"
            id="audit-edit-scheduled-for"
            type="datetime-local"
            value={scheduledFor}
            error={errors.scheduledFor}
            onChange={(event) => {
              setScheduledFor(event.target.value);
              setErrors((current) => ({ ...current, scheduledFor: "" }));
            }}
          />

          <fieldset className="space-y-2">
            <legend className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Auditors
            </legend>
            {assignees.isLoading ? (
              <p className="text-sm text-muted">Loading HSE auditors…</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {auditorOptions.map((auditor) => {
                  const checked = auditorIds.includes(auditor.id);

                  return (
                    <label
                      key={auditor.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAuditor(auditor.id)}
                        className="h-4 w-4 rounded border-line text-navy-700 focus:ring-navy-600/20"
                      />
                      <span>
                        {`${auditor.firstName} ${auditor.lastName}`.trim() ||
                          auditor.id}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {errors.auditorIds && (
              <p role="alert" className="text-xs text-red-600">
                {errors.auditorIds}
              </p>
            )}
          </fieldset>

          <TextareaField
            label="Scope and description (optional)"
            id="audit-edit-description"
            value={description}
            error={errors.description}
            onChange={(event) => {
              setDescription(event.target.value);
              setErrors((current) => ({ ...current, description: "" }));
            }}
            rows={4}
            maxLength={5000}
          />

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={updateAudit.isPending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={updateAudit.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
