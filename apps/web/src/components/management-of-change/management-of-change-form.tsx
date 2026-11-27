"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ErrorState, Spinner } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { useMe } from "@/lib/api/employees";
import { useProjects, useSites } from "@/lib/api/worksites";
import { useCreateManagementOfChange } from "@/lib/api/management-of-change";
import type { FormEvent, ReactNode } from "react";
import { canCreateManagementOfChange } from "@/lib/permissions";

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      <span>
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-100";

const textareaClass = `${inputClass} min-h-28 resize-y`;

export function ManagementOfChangeForm() {
  const router = useRouter();
  const me = useMe();
  const projectsQuery = useProjects({ page: 1, limit: 100 });
  const createMutation = useCreateManagementOfChange();

  const [project, setProject] = useState("");
  const [site, setSite] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("");
  const [changeType, setChangeType] = useState<"TEMPORARY" | "PERMANENT">(
    "PERMANENT",
  );
  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [affectedAssets, setAffectedAssets] = useState("");
  const [affectedPeople, setAffectedPeople] = useState("");
  const [error, setError] = useState("");
  const submitGuard = useRef(false);

  const sitesQuery = useSites({
    projectId: project,
    page: 1,
    limit: 100,
  });

  if (me.isError) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  if (me.isLoading) {
    return <Spinner label="Loading your IKOSH profile..." />;
  }

  if (!canCreateManagementOfChange(me.data?.employee.ikoshRole)) {
    return (
      <ErrorState
        title="Access restricted"
        message="Only HSE officers, HSE managers and administrators may register a change."
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (submitGuard.current || createMutation.isPending) {
      return;
    }

    if (!project) {
      setError("Select the project affected by this change.");
      return;
    }

    if (!title.trim() || !reason.trim() || !scope.trim()) {
      setError("Title, reason and scope are required.");
      return;
    }

    if (plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt) {
      setError("The planned end date cannot be earlier than the start date.");
      return;
    }

    submitGuard.current = true;

    try {
      const response = await createMutation.mutateAsync({
        title: title.trim(),
        reason: reason.trim(),
        scope: scope.trim(),
        changeType,
        plannedStartAt: plannedStartAt
          ? new Date(plannedStartAt).toISOString()
          : null,
        plannedEndAt: plannedEndAt
          ? new Date(plannedEndAt).toISOString()
          : null,
        affectedAssets: affectedAssets
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        affectedPeople: affectedPeople
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        project,
        site: site || null,
      });

      router.push(`/management-of-change/${response.item.id}`);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create the change record.",
      );
      submitGuard.current = false;
    }
  }

  const projects = projectsQuery.data?.projects ?? [];
  const sites = sitesQuery.data?.sites ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Register a change"
        description="Record the proposed change and its scope before assessing its QHSE impacts."
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Creating this record does not authorize the change. Assessment,
        delegated approval, implementation and verification remain separate
        lifecycle controls.
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-line bg-surface p-5 shadow-card"
      >
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">
            Change details
          </h2>

          <Field label="Change title" required>
            <input
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              placeholder="e.g. Replacement of process pump"
            />
          </Field>

          <Field label="Reason for change" required>
            <textarea
              className={textareaClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={5000}
              required
              placeholder="Explain why this change is being proposed."
            />
          </Field>

          <Field label="Scope of change" required>
            <textarea
              className={textareaClass}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              maxLength={5000}
              required
              placeholder="Describe what will change, where it applies and what is included."
            />
          </Field>

          <Field label="Change classification" required>
            <select
              className={inputClass}
              value={changeType}
              onChange={(event) =>
                setChangeType(event.target.value as "TEMPORARY" | "PERMANENT")
              }
            >
              <option value="PERMANENT">Permanent change</option>
              <option value="TEMPORARY">Temporary change</option>
            </select>
          </Field>
        </section>

        <section className="space-y-4 border-t border-line pt-5">
          <h2 className="text-base font-semibold text-foreground">
            Project and site
          </h2>

          <Field label="Project" required>
            <select
              className={inputClass}
              value={project}
              onChange={(event) => {
                setProject(event.target.value);
                setSite("");
              }}
              required
            >
              <option value="">Select project</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Affected site">
            <select
              className={inputClass}
              value={site}
              onChange={(event) => setSite(event.target.value)}
              disabled={!project || sitesQuery.isLoading}
            >
              <option value="">
                {project ? "Select site (optional)" : "Select a project first"}
              </option>
              {sites.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
            {sitesQuery.isError && (
              <span className="text-xs text-red-600">
                Unable to load sites for this project.
              </span>
            )}
          </Field>
        </section>

        <section className="space-y-4 border-t border-line pt-5">
          <h2 className="text-base font-semibold text-foreground">
            Planned schedule
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Planned start">
              <input
                className={inputClass}
                type="date"
                value={plannedStartAt}
                onChange={(event) => setPlannedStartAt(event.target.value)}
              />
            </Field>

            <Field label="Planned end">
              <input
                className={inputClass}
                type="date"
                min={plannedStartAt || undefined}
                value={plannedEndAt}
                onChange={(event) => setPlannedEndAt(event.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 border-t border-line pt-5">
          <h2 className="text-base font-semibold text-foreground">
            Affected resources and people
          </h2>

          <Field label="Affected equipment, assets or systems">
            <textarea
              className={textareaClass}
              value={affectedAssets}
              onChange={(event) => setAffectedAssets(event.target.value)}
              placeholder={"Enter one item per line"}
            />
          </Field>

          <Field label="Affected personnel or teams">
            <textarea
              className={textareaClass}
              value={affectedPeople}
              onChange={(event) => setAffectedPeople(event.target.value)}
              placeholder={"Enter one person, role or team per line"}
            />
          </Field>
        </section>

        <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
          <Link
            href="/management-of-change"
            className="inline-flex items-center rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </Link>

          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create change record"}
          </Button>
        </div>
      </form>
    </div>
  );
}
