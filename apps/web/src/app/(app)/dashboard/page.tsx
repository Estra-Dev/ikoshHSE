"use client";

import Link from "next/link";
import {
  useDepartments,
} from "@/lib/api/departments";
import { EMPTY_DIRECTORY_FILTERS } from "@/lib/api/directory-filters";
import {
  useEmployeeDirectory,
  useMe,
} from "@/lib/api/employees";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Spinner } from "@/components/ui/feedback";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 truncate text-2xl font-bold text-zinc-900 dark:text-white">
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const me = useMe();
  const departments = useDepartments();
  const directory = useEmployeeDirectory({
    filters: { ...EMPTY_DIRECTORY_FILTERS, limit: 1 },
  });

  if (me.isLoading) {
    return <Spinner label="Loading your profile..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  const employee = me.data?.employee;
  const totalEmployees =
    directory.data?.pagination.total !== undefined
      ? String(directory.data.pagination.total)
      : directory.isLoading
        ? "..."
        : "Unavailable";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Welcome back, {employee?.firstName || "colleague"}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="My role"
          value={employee ? employee.ikoshRole.replace("_", " ") : "Unknown"}
          hint="IKOSH application role"
        />
        <StatCard
          label="My department"
          value={employee?.department?.name ?? "Unassigned"}
        />
        <StatCard
          label="Employees"
          value={totalEmployees}
          hint="Active employee records"
        />
        <StatCard
          label="Departments"
          value={
            departments.isLoading
              ? "..."
              : departments.isError
                ? "Unavailable"
                : String(departments.data?.departments.length ?? 0)
          }
          hint="Active departments"
        />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
          Quick actions
        </h2>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/employees"
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800"
          >
            Browse employee directory
          </Link>
          <Link
            href="/employees/me"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Update my contact details
          </Link>
          <Link
            href="/departments"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            View departments
          </Link>
        </div>

        {employee && !employee.isActive && (
          <div className="mt-4">
            <Badge tone="red">Your employee record is inactive</Badge>
          </div>
        )}
      </div>
    </div>
  );
}
