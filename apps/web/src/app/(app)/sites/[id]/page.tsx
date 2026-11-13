"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, buttonStyles, ErrorState, Spinner } from "@/components/ui/feedback";
import { SelectField } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { ArrowLeftIcon } from "@/components/icons";
import {
  ProfileField,
  SectionCard,
  formatProfileDate,
} from "@/components/employees/profile-section";
import { SiteForm } from "@/components/worksites/site-form";
import { WorkSiteStatusBadge } from "@/components/worksites/status-badge";
import { useMe } from "@/lib/api/employees";
import { useHseReference } from "@/lib/api/hse";
import {
  useDeleteSite,
  useProjects,
  useSite,
  useUpdateSite,
} from "@/lib/api/worksites";
import type { SiteSummary } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import {
  canManagePersonnelAccess,
  canManageWorksites,
} from "@/lib/permissions";
import { buildPersonnelSiteHref } from "@/lib/personnel";
import { DEFAULT_SITE_STATUSES } from "@/lib/worksites";

function SiteStatusControl({ site }: { site: SiteSummary }) {
  const updateSite = useUpdateSite();
  const reference = useHseReference();
  const [status, setStatus] = useState(site.status);
  const [error, setError] = useState("");

  const statuses = reference.data?.data.siteStatuses ?? DEFAULT_SITE_STATUSES;

  async function handleSave(): Promise<void> {
    setError("");

    try {
      await updateSite.mutateAsync({
        id: site.id,
        input: { status },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update the site status.",
      );
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Lifecycle status</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Only active sites are visible to non-management roles and can be
        assigned to HSE personnel. Status changes are audited.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <SelectField
            label="Status"
            id="site-detail-status"
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
          isLoading={updateSite.isPending}
          disabled={status === site.status}
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

/** Site detail with project association and management controls. */
export default function SiteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const me = useMe();
  const detail = useSite(id);
  const canManage = canManageWorksites(me.data?.employee.ikoshRole);
  const canManagePersonnel = canManagePersonnelAccess(
    me.data?.employee.ikoshRole,
  );
  const projectsQuery = useProjects({
    includeInactive: canManage,
    limit: 100,
  });
  const deleteSite = useDeleteSite();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState("");

  async function handleDelete(site: SiteSummary): Promise<void> {
    setActionError("");

    try {
      await deleteSite.mutateAsync(site.id);
      router.push("/sites");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to delete the site.",
      );
      setConfirmDelete(false);
    }
  }

  if (me.isLoading || detail.isLoading) {
    return <Spinner label="Loading site..." />;
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
          title="Unable to load this site"
          message={
            detail.error instanceof Error ? detail.error.message : undefined
          }
        />
        <Link href="/sites" className={buttonStyles("secondary", "sm")}>
          <ArrowLeftIcon size={16} />
          Back to sites
        </Link>
      </div>
    );
  }

  const site = detail.data.site;
  const projects = projectsQuery.data?.projects ?? [];
  const visibleProject = projects.find(
    (project) => project.id === site.project.id,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Worksites"
        title={site.name}
        description={`${site.code}${site.project.name ? ` · ${site.project.name}` : ""}`}
        actions={
          <>
            <Link href="/sites" className={buttonStyles("secondary", "sm")}>
              <ArrowLeftIcon size={16} />
              Back to sites
            </Link>
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing((current) => !current)}
              >
                {editing ? "Close editor" : "Edit site"}
              </Button>
            )}
            {canManage && (
              <Button
                variant="danger"
                size="sm"
                disabled={deleteSite.isPending}
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
        <WorkSiteStatusBadge status={site.status} />
        {site.location && (
          <span className="text-sm text-muted">{site.location}</span>
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
            Delete this site permanently?
          </p>
          <p className="mt-1 text-sm text-red-700">
            Sites with assigned HSE personnel or contractor personnel cannot be
            deleted. Reassign them first.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              isLoading={deleteSite.isPending}
              onClick={() => void handleDelete(site)}
            >
              Confirm delete
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={deleteSite.isPending}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}

      {editing && (
        <SiteForm
          key={site.id}
          site={site}
          projects={projects}
          onClose={() => setEditing(false)}
        />
      )}

      <SectionCard
        title="Site details"
        description="HSE reference information for this work location."
      >
        <ProfileField
          label="Project"
          value={site.project.name ?? "Unknown project"}
        />
        <ProfileField label="Code" value={site.code} />
        <ProfileField label="Location" value={site.location ?? "—"} />
        <ProfileField
          label="Last updated"
          value={formatProfileDate(site.updatedAt)}
        />
      </SectionCard>

      {visibleProject && (
        <p className="text-sm">
          <Link
            href={`/projects/${visibleProject.id}`}
            className="font-medium text-navy-700 underline-offset-2 hover:underline"
          >
            View project {visibleProject.name}
          </Link>
        </p>
      )}

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Description</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted">
          {site.description || "No description recorded."}
        </p>
      </section>

      {canManagePersonnel && (
        <section className="rounded-card border border-line bg-surface p-6 shadow-card">
          <h2 className="text-sm font-semibold text-ink">
            Assigned HSE personnel
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Review and update which HSE personnel can access this site. Site
            access controls incident reporting and every site-scoped HSE
            record.
          </p>
          {site.status !== "ACTIVE" && (
            <p className="mt-2 text-sm text-amber-700">
              This site is {formatHseLabel(site.status).toLowerCase()}, so it
              cannot be newly assigned. Existing assignments must be resolved
              in the personnel directory.
            </p>
          )}
          <Link
            href={buildPersonnelSiteHref(site.id)}
            className={`${buttonStyles("secondary", "sm")} mt-4`}
          >
            Manage personnel access
          </Link>
        </section>
      )}

      {canManage && <SiteStatusControl key={site.status} site={site} />}
    </div>
  );
}
