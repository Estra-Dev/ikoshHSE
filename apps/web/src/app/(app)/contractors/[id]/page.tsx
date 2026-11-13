"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import {
  TD,
  TH,
  Table,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeftIcon } from "@/components/icons";
import {
  ProfileField,
  SectionCard,
  formatProfileDate,
} from "@/components/employees/profile-section";
import { ContractorForm } from "@/components/contractors/contractor-form";
import { ContractorPersonnelForm } from "@/components/contractors/contractor-personnel-form";
import { WorkSiteStatusBadge } from "@/components/worksites/status-badge";
import {
  useContractor,
  useDeleteContractor,
} from "@/lib/api/contractors";
import { useContractorPersonnelList } from "@/lib/api/contractor-personnel";
import { useMe } from "@/lib/api/employees";
import { useProjects } from "@/lib/api/worksites";
import type { ContractorSummary } from "@/lib/api/types";
import { formatPersonnelName } from "@/lib/contractors";
import { canManageContractors } from "@/lib/permissions";

/** Contractor detail with associated projects and personnel. */
export default function ContractorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const me = useMe();
  const canManage = canManageContractors(me.data?.employee.ikoshRole);

  const contractorQuery = useContractor(id, { enabled: canManage });
  const contractor = contractorQuery.contractor;

  const personnelQuery = useContractorPersonnelList(
    { contractorId: id, includeInactive: true, page: 1, limit: 100 },
    { enabled: canManage && contractor !== null },
  );
  const projectsQuery = useProjects({ limit: 100, includeInactive: true });
  const deleteContractor = useDeleteContractor();

  const [editing, setEditing] = useState(false);
  const [addingPersonnel, setAddingPersonnel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState("");

  const projectsById = useMemo(
    () =>
      new Map(
        (projectsQuery.data?.projects ?? []).map((project) => [
          project.id,
          project,
        ]),
      ),
    [projectsQuery.data],
  );

  const personnel = personnelQuery.data?.personnel ?? [];

  async function handleDelete(target: ContractorSummary): Promise<void> {
    setActionError("");

    try {
      await deleteContractor.mutateAsync(target.id);
      router.push("/contractors");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete the contractor.",
      );
      setConfirmDelete(false);
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

  if (contractorQuery.isLoading) {
    return <Spinner label="Loading contractor..." />;
  }

  if (contractorQuery.isError) {
    return (
      <ErrorState
        title="Unable to load contractors"
        message={
          contractorQuery.error instanceof Error
            ? contractorQuery.error.message
            : undefined
        }
      />
    );
  }

  if (!contractor) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Contractor not found"
          message="This contractor may have been removed or is outside the supported register scope."
        />
        <Link href="/contractors" className={buttonStyles("secondary", "sm")}>
          <ArrowLeftIcon size={16} />
          Back to contractors
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People & partners"
        title={contractor.name}
        description={
          contractor.registrationNumber
            ? `Registration ${contractor.registrationNumber}`
            : "External contractor organisation"
        }
        actions={
          <>
            <Link
              href="/contractors"
              className={buttonStyles("secondary", "sm")}
            >
              <ArrowLeftIcon size={16} />
              Back to contractors
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Close editor" : "Edit contractor"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleteContractor.isPending}
              onClick={() => {
                setActionError("");
                setConfirmDelete(true);
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={contractor.isActive ? "green" : "neutral"} dot>
          {contractor.isActive ? "Active" : "Inactive"}
        </Badge>
        {contractor.trade && (
          <span className="text-sm text-muted">{contractor.trade}</span>
        )}
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      {confirmDelete && (
        <section className="rounded-card border border-red-200 bg-red-50/60 p-4">
          <p className="text-sm font-medium text-red-800">
            Delete this contractor permanently?
          </p>
          <p className="mt-1 text-sm text-red-700">
            Contractors with associated projects or personnel cannot be
            deleted. Deactivate the contractor instead to preserve history.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              isLoading={deleteContractor.isPending}
              onClick={() => void handleDelete(contractor)}
            >
              Confirm delete
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={deleteContractor.isPending}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}

      {editing && (
        <ContractorForm
          key={contractor.id}
          contractor={contractor}
          projects={projectsQuery.data?.projects ?? []}
          onClose={() => setEditing(false)}
        />
      )}

      <SectionCard
        title="Contractor details"
        description="Registration and primary contact information."
      >
        <ProfileField
          label="Registration number"
          value={contractor.registrationNumber ?? "—"}
        />
        <ProfileField label="Trade" value={contractor.trade ?? "—"} />
        <ProfileField
          label="Contact name"
          value={contractor.contactName ?? "—"}
        />
        <ProfileField
          label="Contact email"
          value={contractor.contactEmail ?? "—"}
        />
        <ProfileField
          label="Contact phone"
          value={contractor.contactPhone ?? "—"}
        />
        <ProfileField
          label="Last updated"
          value={formatProfileDate(contractor.updatedAt)}
        />
      </SectionCard>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Associated projects
            </h2>
            <p className="mt-1 text-sm text-muted">
              Personnel can only be assigned to sites inside these projects.
            </p>
          </div>
          <Link href="/projects" className={buttonStyles("secondary", "sm")}>
            Manage projects
          </Link>
        </div>

        {projectsQuery.isLoading ? (
          <Spinner label="Loading projects..." />
        ) : contractor.projects.length === 0 ? (
          <p className="rounded-card border border-dashed border-navy-200 bg-surface/60 px-6 py-8 text-center text-sm text-muted">
            No projects are associated with this contractor.
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TH scope="col">Project</TH>
                <TH scope="col">Code</TH>
                <TH scope="col">Status</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {contractor.projects.map((association) => {
                const project = projectsById.get(association.id);

                return (
                  <TableRow key={association.id}>
                    <TD>
                      {project ? (
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-navy-800 underline-offset-2 hover:underline"
                        >
                          {project.name}
                        </Link>
                      ) : (
                        <span className="text-muted">Unknown project</span>
                      )}
                    </TD>
                    <TD className="text-muted">{project?.code ?? "—"}</TD>
                    <TD>
                      {project ? (
                        <WorkSiteStatusBadge status={project.status} />
                      ) : (
                        "—"
                      )}
                    </TD>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Contractor personnel
            </h2>
            <p className="mt-1 text-sm text-muted">
              People deployed by this contractor. Sites are managed from each
              personnel record.
            </p>
          </div>
          {!addingPersonnel && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAddingPersonnel(true)}
            >
              Add personnel
            </Button>
          )}
        </div>

        {addingPersonnel && (
          <ContractorPersonnelForm
            key="new-personnel"
            personnel={null}
            contractors={contractorQuery.data?.contractors ?? []}
            defaultContractorId={contractor.id}
            onClose={() => setAddingPersonnel(false)}
          />
        )}

        {personnelQuery.isError ? (
          <ErrorState
            title="Unable to load contractor personnel"
            message={
              personnelQuery.error instanceof Error
                ? personnelQuery.error.message
                : undefined
            }
          />
        ) : personnelQuery.isLoading ? (
          <Spinner label="Loading personnel..." />
        ) : personnel.length === 0 ? (
          <p className="rounded-card border border-dashed border-navy-200 bg-surface/60 px-6 py-8 text-center text-sm text-muted">
            No personnel have been added for this contractor yet.
          </p>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TH scope="col">Person</TH>
                  <TH scope="col">Job title</TH>
                  <TH scope="col">Active sites</TH>
                  <TH scope="col">Status</TH>
                  <TH scope="col">Actions</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {personnel.map((person) => (
                  <TableRow key={person.id}>
                    <TD>
                      <Link
                        href={`/contractor-personnel/${person.id}`}
                        className="font-medium text-navy-800 underline-offset-2 hover:underline"
                      >
                        {formatPersonnelName(person)}
                      </Link>
                      {person.personnelId && (
                        <p className="mt-0.5 text-xs text-muted">
                          {person.personnelId}
                        </p>
                      )}
                    </TD>
                    <TD className="text-muted">{person.jobTitle ?? "—"}</TD>
                    <TD className="text-muted">
                      {person.activeSites.length === 0
                        ? "Unassigned"
                        : person.activeSites
                            .map((site) => site.name ?? site.id)
                            .join(", ")}
                    </TD>
                    <TD>
                      <Badge
                        tone={person.isActive ? "green" : "neutral"}
                        dot
                      >
                        {person.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD>
                      <Link
                        href={`/contractor-personnel/${person.id}`}
                        className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(personnelQuery.data?.pagination.total ?? 0) > personnel.length && (
              <p className="text-sm text-muted">
                Showing the first {personnel.length} of{" "}
                {personnelQuery.data?.pagination.total} personnel.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
