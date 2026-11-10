"use client";

import { useState } from "react";
import { Button } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import { useDepartments } from "@/lib/api/departments";
import { EMPTY_DIRECTORY_FILTERS } from "@/lib/api/directory-filters";
import { useEmployeeDirectory, useUpdateEmployee } from "@/lib/api/employees";
import {
  EMPLOYMENT_TYPES,
  type EmployeeFull,
  type EmploymentType,
} from "@/lib/api/types";

/**
 * Administrator form for an employee's employment and contact information.
 * Remounts (via `key`) from fresh server data after every successful save.
 */
export function EmploymentInfoForm({ employee }: { employee: EmployeeFull }) {
  const updateEmployee = useUpdateEmployee();
  const departments = useDepartments();

  // Candidate managers: the first page of active employees. The API rejects
  // self-management server-side, so the employee's own entry is excluded.
  const directory = useEmployeeDirectory({
    filters: { ...EMPTY_DIRECTORY_FILTERS, sort: "name", limit: 100 },
  });

  const [employeeId, setEmployeeId] = useState(employee.employeeId ?? "");
  const [jobTitle, setJobTitle] = useState(employee.jobTitle ?? "");
  const [department, setDepartment] = useState(employee.department?.id ?? "");
  const [employmentType, setEmploymentType] = useState(
    employee.employmentType ?? "",
  );
  const [hireDate, setHireDate] = useState(employee.hireDate?.slice(0, 10) ?? "");
  const [managerId, setManagerId] = useState(employee.manager?.id ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [location, setLocation] = useState(employee.location ?? "");
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    const employmentTypeValue =
      employmentType === "" ? null : (employmentType as EmploymentType);

    try {
      await updateEmployee.mutateAsync({
        id: employee.id,
        input: {
          employeeId: employeeId.trim() || null,
          jobTitle: jobTitle.trim() || null,
          department: department || null,
          employmentType: employmentTypeValue,
          hireDate: hireDate || null,
          managerId: managerId || null,
          phone: phone.trim() || null,
          location: location.trim() || null,
        },
      });
      setFeedback("Employment information saved.");
    } catch {
      // Error message is rendered from the mutation state below.
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
        Employment information
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Administrator only. Employee IDs must be unique across the directory.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label="Employee ID"
          id="employment-employee-id"
          type="text"
          placeholder="e.g. IK-0100"
          value={employeeId}
          maxLength={20}
          onChange={(event) => setEmployeeId(event.target.value)}
        />
        <TextField
          label="Job title"
          id="employment-job-title"
          type="text"
          placeholder="e.g. Field Officer"
          value={jobTitle}
          maxLength={80}
          onChange={(event) => setJobTitle(event.target.value)}
        />

        <SelectField
          label="Department"
          id="employment-department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          options={[
            { value: "", label: "Unassigned" },
            ...(departments.data?.departments ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            })),
          ]}
        />

        <SelectField
          label="Employment type"
          id="employment-type"
          value={employmentType}
          onChange={(event) => setEmploymentType(event.target.value)}
          options={[
            { value: "", label: "Unassigned" },
            ...EMPLOYMENT_TYPES.map((type) => ({
              value: type,
              label: type.replace("_", " "),
            })),
          ]}
        />

        <TextField
          label="Hire date"
          id="employment-hire-date"
          type="date"
          value={hireDate}
          onChange={(event) => setHireDate(event.target.value)}
        />

        <SelectField
          label="Manager"
          id="employment-manager"
          value={managerId}
          onChange={(event) => setManagerId(event.target.value)}
          options={[
            { value: "", label: "No manager" },
            ...(directory.data?.employees ?? [])
              .filter((option) => option.id !== employee.id)
              .map((option) => ({
                value: option.id,
                label: `${option.firstName} ${option.lastName}`.trim(),
              })),
          ]}
        />

        <TextField
          label="Phone"
          id="employment-phone"
          type="tel"
          placeholder="+234 800 000 0000"
          value={phone}
          maxLength={30}
          onChange={(event) => setPhone(event.target.value)}
        />
        <TextField
          label="Location"
          id="employment-location"
          type="text"
          placeholder="e.g. Port Harcourt"
          value={location}
          maxLength={120}
          onChange={(event) => setLocation(event.target.value)}
        />

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={updateEmployee.isPending}>
            {updateEmployee.isPending ? "Saving..." : "Save employment info"}
          </Button>

          {updateEmployee.isError && (
            <p className="text-sm text-red-600" role="alert">
              {updateEmployee.error instanceof Error
                ? updateEmployee.error.message
                : "Unable to save employment information."}
            </p>
          )}

          {!updateEmployee.isError && feedback && (
            <p className="text-sm text-green-700 dark:text-green-400">
              {feedback}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
