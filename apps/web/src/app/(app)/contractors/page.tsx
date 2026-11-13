"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Button,
  EmptyState,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  TD,
  TH,
  Table,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { ContractorForm } from "@/components/contractors/contractor-form";
import {
  useContractorDirectory,
  useDeleteContractor,
  useUpdateContractor,
} from "@/lib/api/contractors";
import type { ContractorSummary } from "@/lib/api/types";
import { useMe } from "@/lib/api/employees";
import { useProjects } from "@/lib/api/worksites";
import {
  CONTRACTOR_PAGE_SIZE,
  EMPTY_CONTRACTOR_FILTERS,
  filterContractors,
  type ContractorStatusFilter,
} from "@/lib/contractors";
import { canManageContractors } from "@/lib/permissions";

type FormTarget = "new" | ContractorSummary;

/** Contractor register. Management actions are HSE manager/admin only. */
export default function ContractorsPage() {
  const me = useMe();
  const canManage = canManageContractors(me.data?.employee.ikoshRole);

  const [filters, setFilters] = useState(EMPTY_CONTRACTOR_FILTERS);
  const [page, setPage] = useState(1);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const directory = useContractorDirectory({ enabled: canManage });
  const projects = useProjects({ limit: 100, includeInactive: true });
  const deleteContractor = useDeleteContractor();
  const updateContractor = useUpdateContractor();

  const contractors = useMemo(
    () => directory.data?.contractors ?? [],
    [directory.data],
  );
  const filtered = useMemo(
    () => filterContractors(contractors, filters),
    [contractors, filters],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / CONTRACTOR_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * CONTRACTOR_PAGE_SIZE,
    currentPage * CONTRACTOR_PAGE_SIZE,
  );

  function updateFilters(partial: Partial<typeof filters>): void {
    setFilters((current) => ({ ...current, ...partial }));
    setPage(1);
  }

  async function handleDelete(contractor: ContractorSummary): Promise<void> {
    setActionError("");

    try {
      await deleteContractor.mutateAsync(contractor.id);
      setConfirmDeleteId(null);

      if (visible.length === 1 && currentPage > 1) {
        setPage(currentPage - 1);
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete the contractor.",
      );
    }
  }

  async function handleToggleStatus(
    contractor: ContractorSummary,
  ): Promise<void> {
    setActionError("");

    try {
      await updateContractor.mutateAsync({
        id: contractor.id,
        input: { isActive: !contractor.isActive },
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update the contractor status.",
      );
    }
  }

  if (me.isLoading) {
    return <Spinner label="Checking access..." />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (!canManage) {
    return (
      <ErrorState
        title="Access restricted"
        message="Contractor management is available to HSE managers and administrators only."
      />
    );
  }

  if (directory.isError) {
    return (
      <ErrorState
        title="Unable to load contractors"
        message={
          directory.error instanceof Error
            ? directory.error.message
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People & partners"
        title="Contractors"
        description="Manage external contractor organisations, project associations and personnel rosters."
        actions={
          !formTarget ? (
            <Button onClick={() => setFormTarget("new")}>
              New contractor
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label="Search"
          id="contractor-search"
          type="search"
          placeholder="Name, registration, trade or contact"
          value={filters.query}
          onChange={(event) => updateFilters({ query: event.target.value })}
        />
        <SelectField
          label="Status"
          id="contractor-status-filter"
          value={filters.status}
          onChange={(event) =>
            updateFilters({
              status: event.target.value as ContractorStatusFilter,
            })
          }
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active only" },
            { value: "inactive", label: "Inactive only" },
          ]}
        />
      </div>

      {directory.data?.truncated && (
        <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
          Showing the first {contractors.length} of {directory.data.total}{" "}
          contractors. Refine the register to work within the supported limit.
        </p>
      )}

      {formTarget !== null && (
        <ContractorForm
          key={formTarget === "new" ? "new" : formTarget.id}
          contractor={formTarget === "new" ? null : formTarget}
          projects={projects.data?.projects ?? []}
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

      {directory.isLoading ? (
        <Spinner label="Loading contractors..." />
      ) : contractors.length === 0 ? (
        <EmptyState
          title="No contractors yet"
          description="Create the first contractor to start linking projects and personnel."
          action={
            <Button onClick={() => setFormTarget("new")}>
              New contractor
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No contractors match your filters"
          description="Try a different search term or status."
          action={
            <Button
              variant="secondary"
              onClick={() => updateFilters(EMPTY_CONTRACTOR_FILTERS)}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TH scope="col">Contractor</TH>
              <TH scope="col">Trade</TH>
              <TH scope="col">Contact</TH>
              <TH scope="col">Projects</TH>
              <TH scope="col">Status</TH>
              <TH scope="col">Actions</TH>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((contractor) => (
              <TableRow key={contractor.id}>
                <TD>
                  <Link
                    href={`/contractors/${contractor.id}`}
                    className="font-medium text-navy-800 underline-offset-2 hover:underline"
                  >
                    {contractor.name}
                  </Link>
                  {contractor.registrationNumber && (
                    <p className="mt-0.5 text-xs text-muted">
                      {contractor.registrationNumber}
                    </p>
                  )}
                </TD>
                <TD className="text-muted">{contractor.trade ?? "—"}</TD>
                <TD className="text-muted">
                  {contractor.contactName ?? "—"}
                  {contractor.contactEmail && (
                    <p className="mt-0.5 text-xs text-muted">
                      {contractor.contactEmail}
                    </p>
                  )}
                  {contractor.contactPhone && (
                    <p className="text-xs text-muted">
                      {contractor.contactPhone}
                    </p>
                  )}
                </TD>
                <TD className="tabular text-muted">
                  {contractor.projects.length}
                </TD>
                <TD>
                  <Badge
                    tone={contractor.isActive ? "green" : "neutral"}
                    dot
                  >
                    {contractor.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/contractors/${contractor.id}`}
                      className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
                    >
                      View
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={updateContractor.isPending}
                      onClick={() => setFormTarget(contractor)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={updateContractor.isPending}
                      onClick={() => void handleToggleStatus(contractor)}
                    >
                      {contractor.isActive ? "Deactivate" : "Activate"}
                    </Button>

                    {confirmDeleteId === contractor.id ? (
                      <>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={deleteContractor.isPending}
                          onClick={() => void handleDelete(contractor)}
                        >
                          {deleteContractor.isPending
                            ? "Deleting..."
                            : "Confirm delete"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteContractor.isPending}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={deleteContractor.isPending}
                        onClick={() => {
                          setActionError("");
                          setConfirmDeleteId(contractor.id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </TD>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {filtered.length > 0 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={filtered.length}
          limit={CONTRACTOR_PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
