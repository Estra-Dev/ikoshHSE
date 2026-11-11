"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import {
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/fields";
import { EMPTY_DIRECTORY_FILTERS } from "@/lib/api/directory-filters";
import {
  useCreateDepartment,
  useUpdateDepartment,
} from "@/lib/api/departments";
import { useEmployeeDirectory } from "@/lib/api/employees";
import type { DepartmentSummary } from "@/lib/api/types";

/**
 * Administrator form for creating or editing a department. Pass
 * `department` to edit an existing record, or `null` to create a new one.
 */
export function DepartmentForm({
  department,
  onClose,
}: {
  department: DepartmentSummary | null;
  onClose: () => void;
}) {
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();

  // Candidate heads: the first page of active employees.
  const directory = useEmployeeDirectory({
    filters: { ...EMPTY_DIRECTORY_FILTERS, sort: "name", limit: 100 },
  });

  const isEditing = department !== null;
  const mutation = isEditing ? updateDepartment : createDepartment;

  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [description, setDescription] = useState(department?.description ?? "");
  const [headId, setHeadId] = useState(department?.head?.id ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = {
      name: name.trim(),
      code: code.trim(),
      description: description.trim() || null,
      headId: headId || null,
    };

    try {
      if (isEditing && department) {
        await updateDepartment.mutateAsync({ id: department.id, input });
      } else {
        await createDepartment.mutateAsync(input);
      }
      onClose();
    } catch {
      // Error message is rendered from the mutation state below; the form
      // stays open so the administrator can correct the input.
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">
        {isEditing ? `Edit ${department?.name}` : "New department"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Names and codes must be unique across all departments.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          id="department-name"
          type="text"
          required
          placeholder="e.g. Field Operations"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Code"
          id="department-code"
          type="text"
          required
          placeholder="e.g. OPS"
          value={code}
          maxLength={12}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />

        <div className="sm:col-span-2">
          <TextareaField
            label="Description"
            id="department-description"
            rows={3}
            placeholder="What this department is responsible for"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <SelectField
          label="Department head"
          id="department-head"
          value={headId}
          onChange={(event) => setHeadId(event.target.value)}
          options={[
            { value: "", label: "No head assigned" },
            ...(directory.data?.employees ?? []).map((option) => ({
              value: option.id,
              label: `${option.firstName} ${option.lastName}`.trim(),
            })),
          ]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Saving..."
              : isEditing
                ? "Save department"
                : "Create department"}
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
              : "Unable to save the department."}
          </p>
        )}
      </form>
    </section>
  );
}
