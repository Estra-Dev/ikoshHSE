"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useMe } from "@/lib/api/employees";
import {
  useManagementOfChanges,
  type ManagementOfChangeStatus,
} from "@/lib/api/management-of-change";
import { useProjects } from "@/lib/api/worksites";
import {
  canCreateManagementOfChange,
  canViewManagementOfChange,
} from "@/lib/permissions";
import {
  MANAGEMENT_OF_CHANGE_STATUS_LABELS,
  ManagementOfChangeApprovalNotice,
  ManagementOfChangeStatusBadge,
} from "./management-of-change-badges";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function personName(
  person:
    | {
        firstName?: string;
        lastName?: string;
        email?: string;
      }
    | null
    | undefined,
): string {
  if (!person) return "—";

  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.email ||
    "—"
  );
}

export function ManagementOfChangeRegister() {
  const me = useMe();
  const projectsQuery = useProjects({ page: 1, limit: 100 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ManagementOfChangeStatus | "">("");
  const [projectId, setProjectId] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const role = me.data?.employee.ikoshRole;
  const canView = canViewManagementOfChange(role);
  const canCreate = canCreateManagementOfChange(role);

  const changesQuery = useManagementOfChanges({
    page,
    limit: 20,
    status,
    projectId,
    q: search,
  });

  if (me.isLoading) {
    return <Spinner label="Loading your IKOSH profile..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (!canView) {
    return (
      <ErrorState
        title="Access restricted"
        message="Your IKOSH role does not have access to Management of Change."
      />
    );
  }

  if (changesQuery.isError) {
    return (
      <ErrorState
        title="Unable to load change records"
        message={
          changesQuery.error instanceof Error
            ? changesQuery.error.message
            : undefined
        }
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void changesQuery.refetch()}
          >
            Try again
          </Button>
        }
      />
    );
  }

  const changes = changesQuery.data?.items ?? [];
  const pagination = changesQuery.data?.pagination;
  const projects = projectsQuery.data?.projects ?? [];
  const filtersActive = Boolean(status || projectId || search);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setPage(1);
  }

  function clearFilters() {
    setStatus("");
    setProjectId("");
    setSearchDraft("");
    setSearch("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Management of Change"
        description="Register, assess and control proposed changes that may affect QHSE risks, operations, people or the working environment."
        actions={
          canCreate ? (
            <Link
              href="/management-of-change/new"
              className="inline-flex items-center rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-700"
            >
              Register a change
            </Link>
          ) : undefined
        }
      />

      <ManagementOfChangeApprovalNotice
        active={changesQuery.data?.approvalPolicy?.activationConfirmed}
        message={changesQuery.data?.approvalPolicy?.message}
      />

      <section className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <form
          onSubmit={applySearch}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]"
        >
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Search
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={200}
              placeholder="Reference, title or reason"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Status
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ManagementOfChangeStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {Object.entries(MANAGEMENT_OF_CHANGE_STATUS_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Project
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All accessible projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.code})
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!filtersActive}
              onClick={clearFilters}
            >
              Clear
            </Button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <p>
            {pagination
              ? `${pagination.total} record${pagination.total === 1 ? "" : "s"}`
              : "Records within your assigned access scope"}
            {filtersActive ? " matching the current filters" : ""}
          </p>
          {changesQuery.isFetching && !changesQuery.isLoading && (
            <span role="status">Refreshing…</span>
          )}
        </div>
      </section>

      {changesQuery.isLoading ? (
        <Spinner label="Loading change records..." />
      ) : changes.length === 0 ? (
        <EmptyState
          title={filtersActive ? "No matching change records" : "No change records found"}
          description={
            filtersActive
              ? "No records in your accessible scope match the current search and filters."
              : "No changes have been registered yet."
          }
          action={
            canCreate && !filtersActive ? (
              <Link
                href="/management-of-change/new"
                className="inline-flex rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-navy-700"
              >
                Register the first change
              </Link>
            ) : filtersActive ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-line bg-muted/40 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Reference / change</th>
                <th className="px-4 py-3 font-semibold">Project / site</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Planned start</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {changes.map((change) => (
                <tr key={change.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {change.reference}
                    </p>
                    <p className="mt-0.5 max-w-xs text-muted">{change.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">
                      {change.project?.name ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {change.site?.name ?? "No site specified"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {change.changeType === "TEMPORARY"
                      ? "Temporary"
                      : "Permanent"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {personName(change.changeOwner)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(change.plannedStartAt)}
                  </td>
                  <td className="px-4 py-3">
                    <ManagementOfChangeStatusBadge status={change.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/management-of-change/${change.id}`}
                      className="font-medium text-navy-700 underline-offset-2 hover:underline"
                    >
                      View record
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || changesQuery.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={
                page >= pagination.totalPages || changesQuery.isFetching
              }
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
