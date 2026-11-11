"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles, ErrorState, Spinner } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import {
  ArrowLeftIcon,
  ProfileIcon,
} from "@/components/icons";
import { EmploymentInfoForm } from "@/components/employees/employment-info-form";
import {
  formatEnum,
  formatProfileDate,
  ProfileField,
  SectionCard,
} from "@/components/employees/profile-section";
import {
  useEmployee,
  useMe,
  useUpdateEmployeeRole,
  useUpdateEmployeeStatus,
} from "@/lib/api/employees";
import { IKOSH_ROLES, type EmployeeFull, type IkoshRole } from "@/lib/api/types";
import { isAdmin } from "@/lib/permissions";

function formatName(employee: { firstName: string; lastName: string }): string {
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return name || "Unnamed employee";
}

/**
 * Administrator panel for changing an employee's IKOSH role. The API rejects
 * self-role-changes server-side; this panel is only rendered for others.
 */
function RolePanel({ employee }: { employee: EmployeeFull }) {
  const updateRole = useUpdateEmployeeRole();
  const [role, setRole] = useState<IkoshRole>(employee.ikoshRole);
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (role === employee.ikoshRole) {
      setFeedback("Role unchanged.");
      return;
    }

    try {
      await updateRole.mutateAsync({ id: employee.id, ikoshRole: role });
      setFeedback("Role updated.");
    } catch {
      // Error message is rendered from the mutation state below.
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">
        IKOSH role
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Controls what this employee can see and do inside IKOSH HSE. You cannot
        change your own role.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Role"
          id="ikosh-role"
          value={role}
          onChange={(event) => setRole(event.target.value as IkoshRole)}
          options={IKOSH_ROLES.map((option) => ({
            value: option,
            label: option.replace("_", " "),
          }))}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={updateRole.isPending}>
            {updateRole.isPending ? "Updating..." : "Update role"}
          </Button>

          {updateRole.isError && (
            <p className="text-sm text-red-600" role="alert">
              {updateRole.error instanceof Error
                ? updateRole.error.message
                : "Unable to update the role."}
            </p>
          )}

          {!updateRole.isError && feedback && (
            <p className="text-sm text-emerald-700">
              {feedback}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

/**
 * Administrator panel for activating/deactivating an employee. IKOSH
 * employment status is independent of DigitAuth authentication: deactivation
 * blocks application access but keeps the account itself untouched.
 */
function StatusPanel({ employee }: { employee: EmployeeFull }) {
  const updateStatus = useUpdateEmployeeStatus();
  const [confirming, setConfirming] = useState(false);

  async function handleToggle() {
    try {
      await updateStatus.mutateAsync({
        id: employee.id,
        isActive: !employee.isActive,
      });
      setConfirming(false);
    } catch {
      // Error message is rendered from the mutation state below.
    }
  }

  if (employee.isActive) {
    return (
      <section className="rounded-card border border-red-200 bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink">
          Employment status
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Deactivating an employee hides them from the directory and blocks
          their access to all IKOSH HSE features. You cannot deactivate
          yourself.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!confirming ? (
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              disabled={updateStatus.isPending}
            >
              Deactivate employee
            </Button>
          ) : (
            <>
              <Button
                variant="danger"
                onClick={handleToggle}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending
                  ? "Deactivating..."
                  : "Confirm deactivation"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={updateStatus.isPending}
              >
                Cancel
              </Button>
            </>
          )}

          {updateStatus.isError && (
            <p className="text-sm text-red-600" role="alert">
              {updateStatus.error instanceof Error
                ? updateStatus.error.message
                : "Unable to update the status."}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-emerald-200 bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">
        Employment status
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        This employee is currently inactive and cannot access IKOSH HSE.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={handleToggle} disabled={updateStatus.isPending}>
          {updateStatus.isPending ? "Activating..." : "Activate employee"}
        </Button>

        {updateStatus.isError && (
          <p className="text-sm text-red-600" role="alert">
            {updateStatus.error instanceof Error
              ? updateStatus.error.message
              : "Unable to update the status."}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Employee profile. The API decides what the viewer may see: ordinary
 * employees receive basic information only, while management roles (and the
 * employee themselves) receive the full profile. This page renders whatever
 * the server returned; the admin panels below are conveniences only.
 */
export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const me = useMe();
  const detail = useEmployee(id);

  if (me.isLoading || detail.isLoading) {
    return <Spinner label="Loading profile..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Unable to load this employee"
          message={
            detail.error instanceof Error
              ? detail.error.message
              : undefined
          }
        />
        <Link
          href="/employees"
          className={buttonStyles("secondary", "sm")}
        >
          <ArrowLeftIcon size={16} />
          Back to directory
        </Link>
      </div>
    );
  }

  const employee = detail.data.employee;
  const viewer = me.data?.employee;
  const isSelf = viewer?.id === employee.id;
  // Full profiles are recognizable by their administrative fields; the API
  // only includes them for management viewers and the employee themselves.
  const isFull = "ikoshRole" in employee;
  const canManage = isAdmin(viewer?.ikoshRole);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Employee profile"
        description={
          isSelf
            ? "This is your directory entry as others see it."
            : "Details as visible to you."
        }
        actions={
          <>
            {isSelf && (
              <Link
                href="/employees/me"
                className={buttonStyles("secondary", "sm")}
              >
                <ProfileIcon size={16} />
                Manage my contact details
              </Link>
            )}
            <Link href="/employees" className={buttonStyles("secondary", "sm")}>
              <ArrowLeftIcon size={16} />
              Back to directory
            </Link>
          </>
        }
      />

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-ink">
              {formatName(employee)}
            </p>
            <p className="text-sm text-muted">
              {employee.jobTitle ?? "No job title recorded"}
            </p>
          </div>

          {isFull ? (
            <div className="flex flex-wrap gap-2">
              <Badge tone="navy">{formatEnum(employee.ikoshRole)}</Badge>
              <Badge tone={employee.isActive ? "green" : "red"} dot>
                {employee.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge tone={employee.emailVerified ? "green" : "amber"}>
                {employee.emailVerified ? "Email verified" : "Email unverified"}
              </Badge>
            </div>
          ) : (
            <Badge>Basic information</Badge>
          )}
        </div>
      </section>

      <SectionCard title="Contact information">
        <ProfileField label="Email" value={employee.email} />
        <ProfileField label="Phone" value={employee.phone ?? "—"} />
        <ProfileField label="Location" value={employee.location ?? "—"} />
        <ProfileField label="Department" value={employee.department?.name ?? "—"} />
      </SectionCard>

      {isFull ? (
        <SectionCard
          title="Employment information"
          description="Visible to management roles and the employee themselves."
        >
          <ProfileField label="Employee ID" value={employee.employeeId ?? "—"} />
          <ProfileField
            label="Employment type"
            value={formatEnum(employee.employmentType)}
          />
          <ProfileField
            label="Hire date"
            value={formatProfileDate(employee.hireDate)}
          />
          <ProfileField
            label="Manager"
            value={
              employee.manager
                ? `${employee.manager.firstName} ${employee.manager.lastName}`
                : "—"
            }
          />
          <ProfileField
            label="Record created"
            value={formatProfileDate(employee.createdAt)}
          />
        </SectionCard>
      ) : (
        <p className="rounded-card border border-dashed border-navy-200 p-4 text-sm leading-6 text-muted">
          Employment and administrative details are restricted to management
          roles.
        </p>
      )}

      {canManage && isFull && (
        <>
          <EmploymentInfoForm key={employee.updatedAt} employee={employee} />
          {!isSelf && (
            <div className="grid gap-6 lg:grid-cols-2">
              <RolePanel key={`role-${employee.updatedAt}`} employee={employee} />
              <StatusPanel
                key={`status-${employee.updatedAt}`}
                employee={employee}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
