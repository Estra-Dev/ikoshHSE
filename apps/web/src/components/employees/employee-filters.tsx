"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useDepartments,
} from "@/lib/api/departments";
import {
  DIRECTORY_SORT_OPTIONS,
  type DirectoryFilterState,
  type DirectorySort,
} from "@/lib/api/directory-filters";
import {
  EMPLOYMENT_TYPES,
  IKOSH_ROLES,
} from "@/lib/api/types";
import { SelectField, TextField } from "@/components/ui/fields";

interface EmployeeFiltersProps {
  filters: DirectoryFilterState;
  onChange: (partial: Partial<DirectoryFilterState>) => void;
  canListInactive: boolean;
}

/** Search and filter controls for the employee directory. */
export function EmployeeFilters({
  filters,
  onChange,
  canListInactive,
}: EmployeeFiltersProps) {
  const router = useRouter();
  const departments = useDepartments();

  const [searchValue, setSearchValue] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);

  // Keep the box in sync when the URL changes from outside this input
  // (e.g. browser back or "Reset filters"). Adjusting state during render
  // is the documented React pattern for reacting to changed values without
  // cascading effects.
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    setSearchValue(filters.q);
  }

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.q) {
        onChange({ q: searchValue });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchValue, filters.q, onChange]);

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
      <TextField
        label="Search"
        id="employee-search"
        type="search"
        placeholder="Name, email or employee ID"
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
      />

      <SelectField
        label="Department"
        id="employee-filter-department"
        value={filters.department}
        onChange={(event) => onChange({ department: event.target.value })}
        options={[
          { value: "", label: "All departments" },
          ...(departments.data?.departments ?? []).map((department) => ({
            value: department.id,
            label: department.name,
          })),
        ]}
      />

      <SelectField
        label="Role"
        id="employee-filter-role"
        value={filters.ikoshRole}
        onChange={(event) => onChange({ ikoshRole: event.target.value })}
        options={[
          { value: "", label: "All roles" },
          ...IKOSH_ROLES.map((role) => ({
            value: role,
            label: role.replace("_", " "),
          })),
        ]}
      />

      <SelectField
        label="Employment type"
        id="employee-filter-employment-type"
        value={filters.employmentType}
        onChange={(event) => onChange({ employmentType: event.target.value })}
        options={[
          { value: "", label: "All types" },
          ...EMPLOYMENT_TYPES.map((type) => ({
            value: type,
            label: type.replace("_", " "),
          })),
        ]}
      />

      {canListInactive && (
        <SelectField
          label="Status"
          id="employee-filter-status"
          value={filters.isActive}
          onChange={(event) => onChange({ isActive: event.target.value })}
          options={[
            { value: "", label: "Active employees" },
            { value: "true", label: "Active only" },
            { value: "false", label: "Inactive only" },
          ]}
        />
      )}

      <SelectField
        label="Sort by"
        id="employee-filter-sort"
        value={filters.sort}
        onChange={(event) => onChange({ sort: event.target.value as DirectorySort })}
        options={DIRECTORY_SORT_OPTIONS.map((sort) => {
          const labels: Record<DirectorySort, string> = {
            name: "Name (A-Z)",
            "-name": "Name (Z-A)",
            employeeId: "Employee ID (asc)",
            "-employeeId": "Employee ID (desc)",
            hireDate: "Hire date (oldest)",
            "-hireDate": "Hire date (newest)",
            createdAt: "Added (oldest)",
            "-createdAt": "Added (newest)",
          };
          return { value: sort, label: labels[sort] };
        })}
      />

      <div className="flex items-end">
        <button
          type="button"
          onClick={() => router.replace("/employees")}
          className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-navy-50 hover:text-navy-900"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}
