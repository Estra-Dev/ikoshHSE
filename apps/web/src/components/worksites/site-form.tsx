"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/feedback";
import {
  SelectField,
  TextField,
  TextareaField,
} from "@/components/ui/fields";
import { useHseReference } from "@/lib/api/hse";
import { useCreateSite, useUpdateSite } from "@/lib/api/worksites";
import type { ProjectSummary, SiteSummary } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { DEFAULT_SITE_STATUSES } from "@/lib/worksites";

/**
 * HSE site form. A site always belongs to exactly one project. Pass `site` to
 * edit an existing record, or `null` to create a new one.
 */
export function SiteForm({
  site,
  projects,
  defaultProjectId = "",
  onClose,
}: {
  site: SiteSummary | null;
  projects: readonly ProjectSummary[];
  defaultProjectId?: string;
  onClose: () => void;
}) {
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const reference = useHseReference();

  const isEditing = site !== null;
  const mutation = isEditing ? updateSite : createSite;

  const [projectId, setProjectId] = useState(
    site?.project.id ?? (defaultProjectId || projects[0]?.id || ""),
  );
  const [name, setName] = useState(site?.name ?? "");
  const [code, setCode] = useState(site?.code ?? "");
  const [location, setLocation] = useState(site?.location ?? "");
  const [description, setDescription] = useState(site?.description ?? "");
  const [status, setStatus] = useState(site?.status ?? "ACTIVE");

  const statuses = reference.data?.data.siteStatuses ?? DEFAULT_SITE_STATUSES;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = {
      projectId,
      name: name.trim(),
      code: code.trim(),
      description: description.trim(),
      status,
      ...(location.trim()
        ? { location: location.trim() }
        : isEditing
          ? { location: null }
          : {}),
    };

    try {
      if (isEditing && site) {
        await updateSite.mutateAsync({ id: site.id, input });
      } else {
        await createSite.mutateAsync(input);
      }
      onClose();
    } catch {
      // The mutation error is rendered below; keep the form open for correction.
    }
  }

  if (projects.length === 0) {
    return (
      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink">New site</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          A site must belong to a project. Create a project before adding a
          site.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/projects"
            className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
          >
            Go to projects
          </Link>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">
        {isEditing ? `Edit ${site?.name}` : "New site"}
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Sites are physical work locations. Site codes are globally unique and
        active sites can be assigned to HSE personnel.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Project"
          id="site-project"
          required
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          options={projects.map((project) => ({
            value: project.id,
            label: `${project.name} · ${project.code}`,
          }))}
        />
        <TextField
          label="Name"
          id="site-name"
          type="text"
          required
          placeholder="e.g. Jetty Loading Point"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Code"
          id="site-code"
          type="text"
          required
          placeholder="e.g. JLP-01"
          value={code}
          maxLength={32}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <TextField
          label="Location"
          id="site-location"
          type="text"
          placeholder="Site location"
          value={location}
          maxLength={150}
          onChange={(event) => setLocation(event.target.value)}
        />
        <SelectField
          label="Lifecycle status"
          id="site-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={statuses.map((value) => ({
            value,
            label: formatHseLabel(value),
          }))}
        />
        <div className="hidden sm:block" />
        <div className="sm:col-span-2">
          <TextareaField
            label="Description"
            id="site-description"
            rows={3}
            placeholder="Scope or HSE context for this site"
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" isLoading={mutation.isPending}>
            {isEditing ? "Save site" : "Create site"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600 sm:col-span-2" role="alert">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Unable to save the site."}
          </p>
        )}
      </form>
    </section>
  );
}
