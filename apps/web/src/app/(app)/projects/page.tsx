"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  SelectField,
} from "@/components/ui/fields";
import {
  TD,
  TH,
  Table,
  TableBody,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { ProjectForm } from "@/components/worksites/project-form";
import { WorkSiteStatusBadge } from "@/components/worksites/status-badge";
import { useMe } from "@/lib/api/employees";
import { useDeleteProject, useProjects } from "@/lib/api/worksites";
import type { ProjectSummary } from "@/lib/api/types";
import { canManageWorksites } from "@/lib/permissions";

type FormTarget = "new" | ProjectSummary;

/** HSE project register. Management actions are HSE manager/admin only. */
export default function ProjectsPage() {
  const me = useMe();
  const canManage = canManageWorksites(me.data?.employee.ikoshRole);

  const [page, setPage] = useState(1);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const projectsQuery = useProjects({
    page,
    limit: 20,
    includeInactive: canManage && includeInactive,
  });
  const deleteProject = useDeleteProject();

  async function handleDelete(project: ProjectSummary): Promise<void> {
    setActionError("");

    try {
      await deleteProject.mutateAsync(project.id);
      setConfirmDeleteId(null);

      if (projects.length === 1 && page > 1) {
        setPage(page - 1);
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to delete the project.",
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

  if (projectsQuery.isError) {
    return (
      <ErrorState
        title="Unable to load projects"
        message={
          projectsQuery.error instanceof Error
            ? projectsQuery.error.message
            : undefined
        }
      />
    );
  }

  const projects = projectsQuery.data?.projects ?? [];
  const pagination = projectsQuery.data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Worksites"
        title="Projects"
        description="HSE projects group physical work sites. Project lifecycle status controls whether non-management roles can see the project."
        actions={
          canManage && !formTarget ? (
            <Button onClick={() => setFormTarget("new")}>New project</Button>
          ) : undefined
        }
      />

      {canManage && (
        <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:max-w-sm">
          <SelectField
            label="Status scope"
            id="projects-status-scope"
            value={includeInactive ? "all" : "active"}
            onChange={(event) => {
              setIncludeInactive(event.target.value === "all");
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active projects only" },
              { value: "all", label: "All lifecycle statuses" },
            ]}
          />
        </div>
      )}

      {formTarget !== null && (
        <ProjectForm
          key={formTarget === "new" ? "new" : formTarget.id}
          project={formTarget === "new" ? null : formTarget}
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

      {projectsQuery.isLoading ? (
        <Spinner label="Loading projects..." />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects found"
          description={
            canManage
              ? "Create the first project to start adding HSE sites."
              : "No active projects are available yet."
          }
          action={
            canManage ? (
              <Button onClick={() => setFormTarget("new")}>New project</Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TH scope="col">Project</TH>
              <TH scope="col">Code</TH>
              <TH scope="col">Client</TH>
              <TH scope="col">Status</TH>
              {canManage && <TH scope="col">Actions</TH>}
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TD>
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-medium text-navy-800 underline-offset-2 hover:underline"
                  >
                    {project.name}
                  </Link>
                  {project.location && (
                    <p className="mt-0.5 text-xs text-muted">
                      {project.location}
                    </p>
                  )}
                </TD>
                <TD className="text-muted">{project.code}</TD>
                <TD className="text-muted">{project.client ?? "—"}</TD>
                <TD>
                  <WorkSiteStatusBadge status={project.status} />
                </TD>
                {canManage && (
                  <TD>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={deleteProject.isPending}
                        onClick={() => setFormTarget(project)}
                      >
                        Edit
                      </Button>

                      {confirmDeleteId === project.id ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={deleteProject.isPending}
                            onClick={() => void handleDelete(project)}
                          >
                            {deleteProject.isPending
                              ? "Deleting..."
                              : "Confirm delete"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deleteProject.isPending}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={deleteProject.isPending}
                          onClick={() => {
                            setActionError("");
                            setConfirmDeleteId(project.id);
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

      {pagination && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
