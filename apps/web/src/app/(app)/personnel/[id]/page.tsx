"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ArrowLeftIcon } from "@/components/icons";
import { ProfileField, SectionCard, formatEnum } from "@/components/employees/profile-section";
import {
  useEmployee,
  useMe,
  useUpdateEmployeeSites,
} from "@/lib/api/employees";
import { useSites } from "@/lib/api/worksites";
import type { EmployeeFull, SiteSummary } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";
import { canManagePersonnelAccess } from "@/lib/permissions";
import { getSiteAssignmentOption } from "@/lib/personnel";

function formatName(person: { firstName: string; lastName: string }): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || "Unnamed person";
}

/**
 * Site-access editor. The API replaces the full assignment list and rejects
 * inactive sites, so the form mirrors that rule before submitting.
 */
function SiteAccessPanel({
  employee,
  sites,
}: {
  employee: EmployeeFull;
  sites: readonly SiteSummary[];
}) {
  const updateSites = useUpdateEmployeeSites();
  const [selected, setSelected] = useState<string[]>(employee.assignedSites);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const sitesById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites],
  );

  function toggle(siteId: string): void {
    setSelected((current) => {
      const site = sitesById.get(siteId);

      if (!site) {
        return current;
      }

      const option = getSiteAssignmentOption(site, current);

      if (!option.selectable) {
        return current;
      }

      return option.checked
        ? current.filter((id) => id !== siteId)
        : [...current, siteId];
    });
    setFeedback("");
    setError("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFeedback("");
    setError("");

    const inactiveSelected = selected.filter((siteId) => {
      const site = sitesById.get(siteId);
      return site !== undefined && site.status !== "ACTIVE";
    });

    if (inactiveSelected.length > 0) {
      setError(
        "Inactive sites cannot remain assigned. Uncheck them before saving.",
      );
      return;
    }

    try {
      const result = await updateSites.mutateAsync({
        id: employee.id,
        siteIds: selected,
      });
      setSelected(result.employee.assignedSites);
      setFeedback("Site access updated.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update site access.",
      );
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Site access</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Assigned sites control which incidents, near misses and other
        site-scoped HSE records this person can see and report against. Only
        active sites can be newly assigned; inactive assignments must be
        removed before saving.
      </p>

      {sites.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-navy-200 p-4 text-sm text-muted">
          No sites exist yet. Create a site before assigning access.
        </p>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-4">
          <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {sites.map((site) => {
              const option = getSiteAssignmentOption(site, selected);

              return (
                <label
                  key={site.id}
                  className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition ${
                    option.selectable
                      ? "cursor-pointer hover:bg-navy-50/60"
                      : "cursor-not-allowed opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={option.checked}
                    disabled={!option.selectable}
                    onChange={() => toggle(site.id)}
                    className="h-4 w-4 rounded border-line text-navy-800 disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {site.name} · {site.code}
                  </span>
                  {option.inactive && (
                    <Badge tone="amber">{formatHseLabel(site.status)}</Badge>
                  )}
                  {!option.selectable && (
                    <span className="text-xs text-muted">
                      Inactive — unavailable
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" isLoading={updateSites.isPending}>
              Save site access
            </Button>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            {!error && feedback && (
              <p className="text-sm text-emerald-700">{feedback}</p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * HSE personnel access detail. HSE managers and administrators see only the
 * identity, role, active status and site assignments needed to administer
 * HSE access — never HR employment information.
 */
export default function PersonnelAccessPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const me = useMe();
  const detail = useEmployee(id);
  const sites = useSites({ includeInactive: true });

  const viewerRole = me.data?.employee.ikoshRole;
  const canManage = canManagePersonnelAccess(viewerRole);

  if (me.isLoading || detail.isLoading) {
    return <Spinner label="Loading personnel access..." />;
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
        message="HSE personnel and site-access management is available to HSE managers and administrators only."
      />
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Unable to load this person"
          message={
            detail.error instanceof Error ? detail.error.message : undefined
          }
        />
        <Link href="/personnel" className={buttonStyles("secondary", "sm")}>
          <ArrowLeftIcon size={16} />
          Back to HSE personnel
        </Link>
      </div>
    );
  }

  const employee = detail.data.employee;
  const fullEmployee =
    "assignedSites" in employee ? (employee as EmployeeFull) : null;

  if (!fullEmployee) {
    return (
      <ErrorState
        title="Access details unavailable"
        message="The API did not return site-access information for this person."
      />
    );
  }

  const siteNames = new Map(
    (sites.data?.sites ?? []).map((site) => [site.id, site.name]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="HSE personnel & access"
        title={formatName(fullEmployee)}
        description="Administer this person's HSE role, active status and site access."
        actions={
          <Link href="/personnel" className={buttonStyles("secondary", "sm")}>
            <ArrowLeftIcon size={16} />
            Back to HSE personnel
          </Link>
        }
      />

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-ink">
              {formatName(fullEmployee)}
            </p>
            <p className="text-sm text-muted">
              {fullEmployee.jobTitle ?? "No job title recorded"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="navy">
              {formatEnum(fullEmployee.ikoshRole)}
            </Badge>
            <Badge tone={fullEmployee.isActive ? "green" : "red"} dot>
              {fullEmployee.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </section>

      <SectionCard
        title="Contact information"
        description="Identity and contact details only; HR employment records are not part of this view."
      >
        <ProfileField label="Email" value={fullEmployee.email} />
        <ProfileField label="Phone" value={fullEmployee.phone ?? "—"} />
        <ProfileField label="Location" value={fullEmployee.location ?? "—"} />
        <ProfileField
          label="Assigned sites"
          value={
            fullEmployee.assignedSites.length === 0
              ? "No site assigned"
              : fullEmployee.assignedSites
                  .map((siteId) => siteNames.get(siteId) ?? "Unknown site")
                  .join(", ")
          }
        />
      </SectionCard>

      <SiteAccessPanel
        employee={fullEmployee}
        sites={sites.data?.sites ?? []}
      />
    </div>
  );
}
