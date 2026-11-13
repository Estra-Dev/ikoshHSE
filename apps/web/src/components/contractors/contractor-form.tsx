"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import { useCreateContractor, useUpdateContractor } from "@/lib/api/contractors";
import type { ContractorSummary, ProjectSummary } from "@/lib/api/types";
import {
  EMPTY_CONTRACTOR_FORM,
  buildContractorCreateInput,
  buildContractorUpdateInput,
  contractorToFormValues,
  validateContractorForm,
  type ContractorFormErrors,
  type ContractorFormValues,
} from "@/lib/contractors";
import { formatHseLabel } from "@/lib/hse-dashboard";

/**
 * Contractor create/edit form. Pass `contractor` to edit, or `null` to create.
 * Project associations are managed here; removing one is rejected by the API
 * while active personnel assignments remain under that project.
 */
export function ContractorForm({
  contractor,
  projects,
  onClose,
}: {
  contractor: ContractorSummary | null;
  projects: readonly ProjectSummary[];
  onClose: () => void;
}) {
  const createContractor = useCreateContractor();
  const updateContractor = useUpdateContractor();

  const isEditing = contractor !== null;
  const mutation = isEditing ? updateContractor : createContractor;

  const [values, setValues] = useState<ContractorFormValues>(() =>
    contractor ? contractorToFormValues(contractor) : EMPTY_CONTRACTOR_FORM,
  );
  const [errors, setErrors] = useState<ContractorFormErrors>({});

  function setField<K extends keyof ContractorFormValues>(
    key: K,
    value: ContractorFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function toggleProject(projectId: string): void {
    setValues((current) => ({
      ...current,
      projects: current.projects.includes(projectId)
        ? current.projects.filter((id) => id !== projectId)
        : [...current.projects, projectId],
    }));
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const nextErrors = validateContractorForm(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      if (isEditing && contractor) {
        await updateContractor.mutateAsync({
          id: contractor.id,
          input: buildContractorUpdateInput(values),
        });
      } else {
        await createContractor.mutateAsync(
          buildContractorCreateInput(values),
        );
      }
      onClose();
    } catch {
      // The mutation error is rendered below; keep the form open for correction.
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">
        {isEditing ? `Edit ${contractor?.name}` : "New contractor"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Contractors are external partners. Associated projects determine which
        sites their personnel can be assigned to.
      </p>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <TextField
          label="Name"
          id="contractor-name"
          type="text"
          required
          placeholder="e.g. Delta Industrial Services"
          value={values.name}
          maxLength={120}
          error={errors.name}
          onChange={(event) => setField("name", event.target.value)}
        />
        <TextField
          label="Registration number"
          id="contractor-registration"
          type="text"
          placeholder="Company registration number"
          value={values.registrationNumber}
          maxLength={50}
          error={errors.registrationNumber}
          onChange={(event) =>
            setField("registrationNumber", event.target.value)
          }
        />
        <TextField
          label="Trade"
          id="contractor-trade"
          type="text"
          placeholder="e.g. Electrical"
          value={values.trade}
          maxLength={80}
          error={errors.trade}
          onChange={(event) => setField("trade", event.target.value)}
        />
        <TextField
          label="Contact name"
          id="contractor-contact-name"
          type="text"
          placeholder="Primary site contact"
          value={values.contactName}
          maxLength={100}
          error={errors.contactName}
          onChange={(event) => setField("contactName", event.target.value)}
        />
        <TextField
          label="Contact email"
          id="contractor-contact-email"
          type="email"
          placeholder="contact@company.com"
          value={values.contactEmail}
          maxLength={120}
          error={errors.contactEmail}
          onChange={(event) => setField("contactEmail", event.target.value)}
        />
        <TextField
          label="Contact phone"
          id="contractor-contact-phone"
          type="tel"
          placeholder="+234 ..."
          value={values.contactPhone}
          maxLength={30}
          error={errors.contactPhone}
          onChange={(event) => setField("contactPhone", event.target.value)}
        />

        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Associated projects
          </span>
          {projects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-navy-200 p-4 text-sm text-muted">
              No projects exist yet. Create a project before linking sites to
              this contractor.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {projects.map((project) => (
                <label
                  key={project.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-navy-50/60"
                >
                  <input
                    type="checkbox"
                    checked={values.projects.includes(project.id)}
                    onChange={() => toggleProject(project.id)}
                    className="h-4 w-4 rounded border-line text-navy-800"
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {project.name} · {project.code}
                  </span>
                  {project.status !== "ACTIVE" && (
                    <Badge tone="amber">{formatHseLabel(project.status)}</Badge>
                  )}
                </label>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            {values.projects.length} project
            {values.projects.length === 1 ? "" : "s"} selected.
          </p>
        </div>

        {isEditing && (
          <SelectField
            label="Status"
            id="contractor-status"
            value={values.isActive ? "active" : "inactive"}
            onChange={(event) =>
              setField("isActive", event.target.value === "active")
            }
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        )}

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" isLoading={mutation.isPending}>
            {isEditing ? "Save contractor" : "Create contractor"}
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
              : "Unable to save the contractor."}
          </p>
        )}
      </form>
    </section>
  );
}
