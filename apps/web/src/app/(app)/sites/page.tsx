"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
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
import { SiteForm } from "@/components/worksites/site-form";
import { WorkSiteStatusBadge } from "@/components/worksites/status-badge";
import { useMe } from "@/lib/api/employees";
import {
  useDeleteSite,
  useProjects,
  useSites,
} from "@/lib/api/worksites";
import type { SiteSummary } from "@/lib/api/types";
import { canManageWorksites } from "@/lib/permissions";

type FormTarget = "new" | SiteSummary;

/** HSE site register with project and lifecycle filters. */
export default function SitesPage() {
  const me = useMe();
  const canManage = canManageWorksites(me.data?.employee.ikoshRole);

  const [page, setPage] = useState(1);
  const [projectId, setProjectId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const projectsQuery = useProjects({
    limit: 100,
    includeInactive: canManage,
  });
  const sitesQuery = useSites({
    projectId,
    page,
    limit: 20,
    includeInactive: canManage && includeInactive,
  });
  const deleteSite = useDeleteSite();

  const projectNames = useMemo(
    () =>
      new Map(
        (projectsQuery.data?.projects ?? []).map((project) => [
          project.id,
          `${project.name} · ${project.code}`,
        ]),
      ),
    [projectsQuery.data],
  );

  async function handleDelete(site: SiteSummary): Promise<void> {
    setActionError("");

    try {
      await deleteSite.mutateAsync(site.id);
      setConfirmDeleteId(null);

      if (sites.length === 1 && page > 1) {
        setPage(page - 1);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to delete the site.",
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

  if (sitesQuery.isError) {
    return (
      <ErrorState
        title="Unable to load sites"
        message={
          sitesQuery.error instanceof Error
            ? sitesQuery.error.message
            : undefined
        }
      />
    );
  }

  const sites = sitesQuery.data?.sites ?? [];
  const pagination = sitesQuery.data?.pagination;
  const projects = projectsQuery.data?.projects ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Worksites"
        title="Sites"
        description="Physical work locations used by incidents, near misses and HSE personnel site access. Only active sites can be assigned to personnel."
        actions={
          canManage && !formTarget ? (
            <Button onClick={() => setFormTarget("new")}>New site</Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Project"
          id="sites-filter-project"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All projects" },
            ...projects.map((project) => ({
              value: project.id,
              label: `${project.name} · ${project.code}`,
            })),
          ]}
        />

        {canManage && (
          <SelectField
            label="Status scope"
            id="sites-filter-status"
            value={includeInactive ? "all" : "active"}
            onChange={(event) => {
              setIncludeInactive(event.target.value === "all");
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active sites only" },
              { value: "all", label: "All lifecycle statuses" },
            ]}
          />
        )}
      </div>

      {formTarget !== null && (
        <SiteForm
          key={formTarget === "new" ? "new" : formTarget.id}
          site={formTarget === "new" ? null : formTarget}
          projects={projects}
          defaultProjectId={projectId}
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

      {sitesQuery.isLoading ? (
        <Spinner label="Loading sites..." />
      ) : sites.length === 0 ? (
        <EmptyState
          title="No sites found"
          description={
            canManage
              ? "Create a site under a project to start reporting HSE activity."
              : "No active sites are available in your assigned scope."
          }
          action={
            canManage ? (
              <Button onClick={() => setFormTarget("new")}>New site</Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TH scope="col">Site</TH>
              <TH scope="col">Code</TH>
              <TH scope="col">Project</TH>
              <TH scope="col">Location</TH>
              <TH scope="col">Status</TH>
              {canManage && <TH scope="col">Actions</TH>}
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
                <TD className="text-muted">
                  {site.project.name ??
                    projectNames.get(site.project.id) ??
                    "Unknown project"}
                </TD>
                <TD className="text-muted">{site.location ?? "—"}</TD>
                <TD>
                  <WorkSiteStatusBadge status={site.status} />
                </TD>
                {canManage && (
                  <TD>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/sites/${site.id}`}
                        className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={deleteSite.isPending}
                        onClick={() => setFormTarget(site)}
                      >
                        Edit
                      </Button>

                      {confirmDeleteId === site.id ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={deleteSite.isPending}
                            onClick={() => void handleDelete(site)}
                          >
                            {deleteSite.isPending
                              ? "Deleting..."
                              : "Confirm delete"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deleteSite.isPending}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={deleteSite.isPending}
                          onClick={() => {
                            setActionError("");
                            setConfirmDeleteId(site.id);
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
