"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { TD, TH, Table, TableBody, TableHead, TableRow } from "@/components/ui/table";
import { DepartmentForm } from "@/components/departments/department-form";
import {
  useDeleteDepartment,
  useDepartments,
  useUpdateDepartment,
} from "@/lib/api/departments";
import { useMe } from "@/lib/api/employees";
import type { DepartmentSummary } from "@/lib/api/types";
import { canManageDepartments } from "@/lib/permissions";

type FormTarget = "new" | DepartmentSummary;

/**
 * Department overview with member counts. Creating, editing and deleting is
 * administrator-only; the API enforces the same rules server-side.
 */
export default function DepartmentsPage() {
  const me = useMe();
  const canManage = canManageDepartments(me.data?.employee.ikoshRole);

  const departmentsQuery = useDepartments(canManage);
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function handleToggle(department: DepartmentSummary): Promise<void> {
    setActionError("");

    try {
      await updateDepartment.mutateAsync({
        id: department.id,
        input: { isActive: !department.isActive },
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update the department.",
      );
    }
  }

  async function handleDelete(department: DepartmentSummary): Promise<void> {
    setActionError("");

    try {
      await deleteDepartment.mutateAsync(department.id);
      setConfirmDeleteId(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete the department.",
      );
    }
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (departmentsQuery.isError) {
    return (
      <ErrorState
        title="Unable to load departments"
        message={
          departmentsQuery.error instanceof Error
            ? departmentsQuery.error.message
            : undefined
        }
      />
    );
  }

  const departments = departmentsQuery.data?.departments ?? [];
  const isBusy =
    updateDepartment.isPending || deleteDepartment.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Departments"
        description="Organizational units used to group employees in the directory."
        actions={
          canManage && !formTarget ? (
            <Button onClick={() => setFormTarget("new")}>
              New department
            </Button>
          ) : undefined
        }
      />

      {formTarget !== null && (
        <DepartmentForm
          key={formTarget === "new" ? "new" : formTarget.id}
          department={formTarget === "new" ? null : formTarget}
          onClose={() => setFormTarget(null)}
        />
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      {departmentsQuery.isLoading ? (
        <Spinner label="Loading departments..." />
      ) : departments.length === 0 ? (
        <EmptyState
          title="No departments yet"
          description={
            canManage
              ? "Create the first department to start organizing employees."
              : "An administrator has not created any departments yet."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TH scope="col">Name</TH>
              <TH scope="col">Code</TH>
              <TH scope="col">Head</TH>
              <TH scope="col">Members</TH>
              {canManage && <TH scope="col">Status</TH>}
              {canManage && <TH scope="col">Actions</TH>}
            </TableRow>
          </TableHead>
          <TableBody>
            {departments.map((department) => (
              <TableRow key={department.id}>
                <TD className="font-medium text-ink">
                  {department.name}
                  {department.description && (
                    <p className="mt-0.5 max-w-md text-xs font-normal text-muted">
                      {department.description}
                    </p>
                  )}
                </TD>
                <TD className="text-muted">{department.code}</TD>
                <TD className="text-muted">
                  {department.head
                    ? `${department.head.firstName} ${department.head.lastName}`
                    : "—"}
                </TD>
                <TD className="tabular text-muted">{department.memberCount}</TD>
                {canManage && (
                  <TD>
                    <Badge
                      tone={department.isActive ? "green" : "neutral"}
                    >
                      {department.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TD>
                )}
                {canManage && (
                  <TD>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => setFormTarget(department)}
                      >
                        Edit
                      </Button>

                      <Button
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() => void handleToggle(department)}
                      >
                        {department.isActive ? "Deactivate" : "Activate"}
                      </Button>

                      {confirmDeleteId === department.id ? (
                        <>
                          <Button
                            variant="danger"
                            disabled={isBusy}
                            onClick={() => void handleDelete(department)}
                          >
                            {deleteDepartment.isPending
                              ? "Deleting..."
                              : "Confirm delete"}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="danger"
                          disabled={isBusy}
                          onClick={() => {
                            setActionError("");
                            setConfirmDeleteId(department.id);
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </TD>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
