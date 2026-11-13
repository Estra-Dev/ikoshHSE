"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, buttonStyles, ErrorState, Spinner } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
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
import { ProjectForm } from "@/components/worksites/project-form";
import { WorkSiteStatusBadge } from "@/components/worksites/status-badge";
import { useMe } from "@/lib/api/employees";
import { useHseReference } from "@/lib/api/hse";
import {
  useDeleteProject,
  useProject,
  useSites,
  useUpdateProject,
} from "@/lib/api/worksites";
import type { ProjectSummary } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { canManageWorksites } from "@/lib/permissions";
import { DEFAULT_PROJECT_STATUSES } from "@/lib/worksites";

function ProjectStatusControl({ project }: { project: ProjectSummary }) {
  const updateProject = useUpdateProject();
  const reference = useHseReference();
  const [status, setStatus] = useState(project.status);
  const [error, setError] = useState("");

  const statuses =
    reference.data?.data.projectStatuses ?? DEFAULT_PROJECT_STATUSES;

  async function handleSave(): Promise<void> {
    setError("");

    try {
      await updateProject.mutateAsync({
        id: project.id,
        input: { status },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update the project status.",
      );
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Lifecycle status</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Only active projects are visible to non-management roles. Changing the
        status is audited.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <SelectField
            label="Status"
            id="project-detail-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={statuses.map((value) => ({
              value,
              label: formatHseLabel(value),
            }))}
          />
        </div>
        <Button
          variant="secondary"
          isLoading={updateProject.isPending}
          disabled={status === project.status}
          onClick={() => void handleSave()}
        >
          Update status
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

/** Project detail with associated sites and management controls. */
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const me = useMe();
  const detail = useProject(id);
  const canManage = canManageWorksites(me.data?.employee.ikoshRole);
  const sitesQuery = useSites({
    projectId: id,
    includeInactive: canManage,
    limit: 100,
  });
  const deleteProject = useDeleteProject();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState("");

  async function handleDelete(project: ProjectSummary): Promise<void> {
    setActionError("");

    try {
      await deleteProject.mutateAsync(project.id);
      router.push("/projects");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete the project.",
      );
      setConfirmDelete(false);
    }
  }

  if (me.isLoading || detail.isLoading) {
    return <Spinner label="Loading project..." />;
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
          title="Unable to load this project"
          message={
            detail.error instanceof Error ? detail.error.message : undefined
          }
        />
        <Link href="/projects" className={buttonStyles("secondary", "sm")}>
          <ArrowLeftIcon size={16} />
          Back to projects
        </Link>
      </div>
    );
  }

  const project = detail.data.project;
  const sites = sitesQuery.data?.sites ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Worksites"
        title={project.name}
        description={`${project.code}${project.client ? ` · ${project.client}` : ""}`}
        actions={
          <>
            <Link href="/projects" className={buttonStyles("secondary", "sm")}>
              <ArrowLeftIcon size={16} />
              Back to projects
            </Link>
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing((current) => !current)}
              >
                {editing ? "Close editor" : "Edit project"}
              </Button>
            )}
            {canManage && (
              <Button
                variant="danger"
                size="sm"
                disabled={deleteProject.isPending}
                onClick={() => {
                  setActionError("");
                  setConfirmDelete(true);
                }}
              >
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <WorkSiteStatusBadge status={project.status} />
        {project.location && (
          <span className="text-sm text-muted">{project.location}</span>
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
            Delete this project permanently?
          </p>
          <p className="mt-1 text-sm text-red-700">
            Projects with sites cannot be deleted. Archive or delete the sites
            first.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              isLoading={deleteProject.isPending}
              onClick={() => void handleDelete(project)}
            >
              Confirm delete
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={deleteProject.isPending}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}

      {editing && (
        <ProjectForm
          key={project.id}
          project={project}
          onClose={() => setEditing(false)}
        />
      )}

      <SectionCard
        title="Project details"
        description="HSE reference information for this project."
      >
        <ProfileField label="Code" value={project.code} />
        <ProfileField label="Client" value={project.client ?? "—"} />
        <ProfileField label="Location" value={project.location ?? "—"} />
        <ProfileField
          label="Start date"
          value={formatProfileDate(project.startDate)}
        />
        <ProfileField
          label="End date"
          value={formatProfileDate(project.endDate)}
        />
        <ProfileField
          label="Last updated"
          value={formatProfileDate(project.updatedAt)}
        />
      </SectionCard>

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Description</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted">
          {project.description || "No description recorded."}
        </p>
      </section>

      {canManage && <ProjectStatusControl key={project.status} project={project} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Sites</h2>
            <p className="mt-1 text-sm text-muted">
              Physical work locations belonging to this project.
            </p>
          </div>
          {canManage && (
            <Link href="/sites" className={buttonStyles("secondary", "sm")}>
              Manage sites
            </Link>
          )}
        </div>

        {sitesQuery.isError ? (
          <ErrorState
            title="Unable to load sites"
            message={
              sitesQuery.error instanceof Error
                ? sitesQuery.error.message
                : undefined
            }
          />
        ) : sitesQuery.isLoading ? (
          <Spinner label="Loading sites..." />
        ) : sites.length === 0 ? (
          <p className="rounded-card border border-dashed border-navy-200 bg-surface/60 px-6 py-8 text-center text-sm text-muted">
            No sites are visible for this project.
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TH scope="col">Site</TH>
                <TH scope="col">Code</TH>
                <TH scope="col">Location</TH>
                <TH scope="col">Status</TH>
              </TableRow>
            </TableHead>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TD>
                    <Link
                      href={`/sites/${site.id}`}
                      className="font-medium text-navy-800 underline-offset-2 hover:underline"
                    >
                      {site.name}
                    </Link>
                  </TD>
                  <TD className="text-muted">{site.code}</TD>
                  <TD className="text-muted">{site.location ?? "—"}</TD>
                  <TD>
                    <WorkSiteStatusBadge status={site.status} />
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
