"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonStyles } from "@/components/ui/feedback";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SelectField, TextField, TextareaField } from "@/components/ui/fields";
import { useAuditAssignees, useCreateAudit } from "@/lib/api/audits";
import { useProjects, useSites } from "@/lib/api/worksites";
import type { AuditType, CreateHseAuditInput } from "@/lib/api/types";
import { auditDetailHref } from "@/lib/audits";

const MAX_CHECKLIST_ITEMS = 200;

interface ChecklistRow {
  key: number;
  item: string;
  notes: string;
}

let checklistSequence = 0;

function blankChecklistRow(): ChecklistRow {
  checklistSequence += 1;
  return { key: checklistSequence, item: "", notes: "" };
}

/**
 * Audit scheduling form. The project is mandatory; a site is optional but must
 * belong to the project. At least one active HSE auditor is required. An
 * optional checklist can be prepared up front; results are recorded later.
 */
export function AuditForm() {
  const router = useRouter();
  const createAudit = useCreateAudit();
  const assignees = useAuditAssignees();
  const projects = useProjects();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<AuditType>("INTERNAL");
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [auditorIds, setAuditorIds] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [description, setDescription] = useState("");
  const [checklist, setChecklist] = useState<ChecklistRow[]>([
    blankChecklistRow(),
  ]);
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

    const checklistInput = checklist
      .filter((row) => row.item.trim())
      .map((row) => ({
        item: row.item.trim(),
        ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
      }));

    const input: CreateHseAuditInput = {
      title: title.trim(),
      type,
      projectId,
      auditorIds,
      scheduledFor: new Date(scheduledFor).toISOString(),
    };

    if (siteId) {
      input.siteId = siteId;
    }

    if (description.trim()) {
      input.description = description.trim();
    }

    if (checklistInput.length > 0) {
      input.checklist = checklistInput;
    }

    try {
      const result = await createAudit.mutateAsync(input);
      router.push(auditDetailHref(result.audit.id));
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "The audit could not be scheduled. Please try again.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Audit schedule"
        description="Choose the scope, auditors and date. Checklist results and findings are recorded while the audit is conducted."
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
              id="audit-title"
              value={title}
              error={errors.title}
              onChange={(event) => {
                setTitle(event.target.value);
                setErrors((current) => ({ ...current, title: "" }));
              }}
              maxLength={300}
              placeholder="e.g. Annual HSE management system audit"
            />

            <SelectField
              label="Type"
              id="audit-type"
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
              id="audit-project"
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
              id="audit-site"
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
            id="audit-scheduled-for"
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
            ) : auditorOptions.length === 0 ? (
              <p className="text-sm text-muted">
                No active HSE auditors are available.
              </p>
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
            id="audit-description"
            value={description}
            error={errors.description}
            onChange={(event) => {
              setDescription(event.target.value);
              setErrors((current) => ({ ...current, description: "" }));
            }}
            rows={4}
            maxLength={5000}
            placeholder="What standards, activities or areas will be audited?"
          />

          <fieldset className="space-y-3 rounded-lg border border-line bg-navy-50/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <legend className="text-sm font-semibold text-ink">
                  Checklist (optional)
                </legend>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Prepare the questions now; results are recorded while the
                  audit is in progress.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setChecklist((current) =>
                    current.length >= MAX_CHECKLIST_ITEMS
                      ? current
                      : [...current, blankChecklistRow()],
                  )
                }
                disabled={checklist.length >= MAX_CHECKLIST_ITEMS}
              >
                Add question
              </Button>
            </div>

            {checklist.map((row, index) => (
              <div
                key={row.key}
                className="space-y-3 rounded-lg border border-line bg-surface p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Question {index + 1}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setChecklist((current) =>
                        current.filter((entry) => entry.key !== row.key),
                      )
                    }
                    disabled={checklist.length === 1}
                  >
                    Remove
                  </Button>
                </div>

                <TextField
                  label="Question"
                  id={`audit-checklist-item-${row.key}`}
                  value={row.item}
                  onChange={(event) =>
                    setChecklist((current) =>
                      current.map((entry) =>
                        entry.key === row.key
                          ? { ...entry, item: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  maxLength={1000}
                  placeholder="e.g. Are permits to work available and signed?"
                />

                <TextField
                  label="Guidance notes (optional)"
                  id={`audit-checklist-notes-${row.key}`}
                  value={row.notes}
                  onChange={(event) =>
                    setChecklist((current) =>
                      current.map((entry) =>
                        entry.key === row.key
                          ? { ...entry, notes: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  maxLength={2000}
                  placeholder="What evidence should be checked?"
                />
              </div>
            ))}
          </fieldset>

          {assignees.isError && (
            <p role="alert" className="text-sm text-red-700">
              Unable to load assignable HSE auditors.{" "}
              {assignees.error instanceof Error
                ? assignees.error.message
                : "Please try again."}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            <Button type="submit" isLoading={createAudit.isPending}>
              Schedule audit
            </Button>
            <Link href="/audits" className={buttonStyles("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
