"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import {
  useCreateContractorPersonnel,
  useUpdateContractorPersonnel,
} from "@/lib/api/contractor-personnel";
import type {
  ContractorPersonnelSummary,
  ContractorSummary,
} from "@/lib/api/types";
import {
  EMPTY_CONTRACTOR_PERSONNEL_FORM,
  buildContractorPersonnelCreateInput,
  buildContractorPersonnelUpdateInput,
  buildContractorSelectOptions,
  personnelToFormValues,
  validateContractorPersonnelForm,
  type ContractorPersonnelFormErrors,
  type ContractorPersonnelFormValues,
} from "@/lib/contractors";

/**
 * Contractor personnel create/edit form. Sites are intentionally absent:
 * deployments are managed only through the assignment endpoints.
 */
export function ContractorPersonnelForm({
  personnel,
  contractors,
  defaultContractorId = "",
  contractorLocked = false,
  onClose,
}: {
  personnel: ContractorPersonnelSummary | null;
  contractors: readonly ContractorSummary[];
  defaultContractorId?: string;
  contractorLocked?: boolean;
  onClose: () => void;
}) {
  const createPersonnel = useCreateContractorPersonnel();
  const updatePersonnel = useUpdateContractorPersonnel();

  const isEditing = personnel !== null;
  const mutation = isEditing ? updatePersonnel : createPersonnel;

  const [values, setValues] = useState<ContractorPersonnelFormValues>(() => {
    if (personnel) {
      return personnelToFormValues(personnel);
    }

    return {
      ...EMPTY_CONTRACTOR_PERSONNEL_FORM,
      contractorId: defaultContractorId,
    };
  });
  const [errors, setErrors] = useState<ContractorPersonnelFormErrors>({});

  function setField<K extends keyof ContractorPersonnelFormValues>(
    key: K,
    value: ContractorPersonnelFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const nextErrors = validateContractorPersonnelForm(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      if (isEditing && personnel) {
        await updatePersonnel.mutateAsync({
          id: personnel.id,
          input: buildContractorPersonnelUpdateInput(values, {
            lockContractor: contractorLocked,
          }),
        });
      } else {
        await createPersonnel.mutateAsync(
          buildContractorPersonnelCreateInput(values),
        );
      }
      onClose();
    } catch {
      // The mutation error is rendered below; keep the form open for correction.
    }
  }

  if (contractors.length === 0) {
    return (
      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink">New personnel</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Personnel belong to a contractor. Create a contractor before adding
          personnel.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/contractors"
            className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
          >
            Go to contractors
          </Link>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">
        {isEditing
          ? `Edit ${personnel?.firstName} ${personnel?.lastName}`.trim()
          : "New personnel"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Personnel records belong to a contractor. Site deployments are added
        separately from the personnel detail page.
      </p>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <SelectField
          label="Contractor"
          id="personnel-contractor"
          required
          value={values.contractorId}
          disabled={contractorLocked}
          error={errors.contractorId}
          hint={
            contractorLocked
              ? "End active site assignments and resolve the legacy site reference before changing contractor."
              : undefined
          }
          onChange={(event) => setField("contractorId", event.target.value)}
          options={buildContractorSelectOptions(
            contractors,
            "Select a contractor",
          )}
        />
        <div className="hidden sm:block" />
        <TextField
          label="First name"
          id="personnel-first-name"
          type="text"
          required
          value={values.firstName}
          maxLength={80}
          error={errors.firstName}
          onChange={(event) => setField("firstName", event.target.value)}
        />
        <TextField
          label="Last name"
          id="personnel-last-name"
          type="text"
          required
          value={values.lastName}
          maxLength={80}
          error={errors.lastName}
          onChange={(event) => setField("lastName", event.target.value)}
        />
        <TextField
          label="Personnel ID"
          id="personnel-id"
          type="text"
          placeholder="Badge or payroll identifier"
          value={values.personnelId}
          maxLength={50}
          error={errors.personnelId}
          onChange={(event) => setField("personnelId", event.target.value)}
        />
        <TextField
          label="Job title"
          id="personnel-job-title"
          type="text"
          placeholder="e.g. Welder"
          value={values.jobTitle}
          maxLength={120}
          error={errors.jobTitle}
          onChange={(event) => setField("jobTitle", event.target.value)}
        />
        <TextField
          label="Phone"
          id="personnel-phone"
          type="tel"
          value={values.phone}
          maxLength={30}
          error={errors.phone}
          onChange={(event) => setField("phone", event.target.value)}
        />
        <TextField
          label="Email"
          id="personnel-email"
          type="email"
          value={values.email}
          maxLength={120}
          error={errors.email}
          onChange={(event) => setField("email", event.target.value)}
        />

        {isEditing && (
          <SelectField
            label="Status"
            id="personnel-status"
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
            {isEditing ? "Save personnel" : "Create personnel"}
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
              : "Unable to save the personnel record."}
          </p>
        )}
      </form>
    </section>
  );
}
