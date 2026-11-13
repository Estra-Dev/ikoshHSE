"use client";

import { useMemo, useState } from "react";
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
import {
  ProfileField,
  SectionCard,
  formatProfileDate,
} from "@/components/employees/profile-section";
import { ContractorAssignmentManager } from "@/components/contractors/contractor-assignment-manager";
import { ContractorPersonnelForm } from "@/components/contractors/contractor-personnel-form";
import { useContractorDirectory } from "@/lib/api/contractors";
import { useContractorPersonnel } from "@/lib/api/contractor-personnel";
import { useMe } from "@/lib/api/employees";
import { useSites } from "@/lib/api/worksites";
import {
  canChangePersonnelContractor,
  formatPersonnelName,
} from "@/lib/contractors";
import { canManageContractors } from "@/lib/permissions";

/** Contractor personnel detail, active deployments and assignment history. */
export default function ContractorPersonnelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const me = useMe();
  const canManage = canManageContractors(me.data?.employee.ikoshRole);

  const detail = useContractorPersonnel(id, { enabled: canManage });
  const directory = useContractorDirectory({ enabled: canManage });
  const sitesQuery = useSites({ includeInactive: true, limit: 100 });

  const [editing, setEditing] = useState(false);

  const person = detail.data?.personnel;
  const contractor =
    directory.data?.contractors.find(
      (entry) => entry.id === person?.contractor.id,
    ) ?? null;

  const sites = useMemo(
    () => sitesQuery.data?.sites ?? [],
    [sitesQuery.data],
  );
  const sitesById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites],
  );
  const legacySite = person?.site ? sitesById.get(person.site.id) : undefined;
  const contractorLocked = person
    ? !canChangePersonnelContractor(person)
    : false;

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
        message="Contractor personnel management is available to HSE managers and administrators only."
      />
    );
  }

  if (detail.isLoading) {
    return <Spinner label="Loading personnel..." />;
  }

  if (detail.isError || !person) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Unable to load this personnel record"
          message={
            detail.error instanceof Error ? detail.error.message : undefined
          }
        />
        <Link
          href="/contractor-personnel"
          className={buttonStyles("secondary", "sm")}
        >
          <ArrowLeftIcon size={16} />
          Back to contractor personnel
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People & partners"
        title={formatPersonnelName(person)}
        description={
          person.jobTitle ??
          contractor?.name ??
          "Contractor personnel record"
        }
        actions={
          <>
            <Link
              href="/contractor-personnel"
              className={buttonStyles("secondary", "sm")}
            >
              <ArrowLeftIcon size={16} />
              Back to personnel
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Close editor" : "Edit personnel"}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={person.isActive ? "green" : "neutral"} dot>
          {person.isActive ? "Active" : "Inactive"}
        </Badge>
        {contractor && (
          <Link
            href={`/contractors/${contractor.id}`}
            className="text-sm font-medium text-navy-700 underline-offset-2 hover:underline"
          >
            {contractor.name}
          </Link>
        )}
        {!contractor && (
          <span className="text-sm text-muted">Contractor unavailable</span>
        )}
      </div>

      {person.site && (
        <section className="rounded-card border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-900">
            Legacy site reference retained
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            This record still references{" "}
            <span className="font-medium">
              {legacySite ? `${legacySite.name} · ${legacySite.code}` : person.site.id}
            </span>{" "}
            through the legacy field. Site deployments should be managed through
            assignments; the legacy value is kept until the backend backfill is
            verified.
          </p>
        </section>
      )}

      {editing && (
        <ContractorPersonnelForm
          key={person.id}
          personnel={person}
          contractors={directory.data?.contractors ?? []}
          contractorLocked={contractorLocked}
          onClose={() => setEditing(false)}
        />
      )}

      <SectionCard
        title="Personnel details"
        description="Identity and contractor association."
      >
        <ProfileField
          label="Personnel ID"
          value={person.personnelId ?? "—"}
        />
        <ProfileField label="Job title" value={person.jobTitle ?? "—"} />
        <ProfileField
          label="Contractor"
          value={contractor?.name ?? person.contractor.id}
        />
        <ProfileField label="Phone" value={person.phone ?? "—"} />
        <ProfileField label="Email" value={person.email ?? "—"} />
        <ProfileField
          label="Last updated"
          value={formatProfileDate(person.updatedAt)}
        />
      </SectionCard>

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
        <Spinner label="Loading site assignments..." />
      ) : (
        <ContractorAssignmentManager
          personnel={person}
          contractor={contractor}
          sites={sites}
          activeAssignments={detail.data?.activeAssignments ?? []}
          assignmentHistory={detail.data?.assignmentHistory ?? []}
        />
      )}
    </div>
  );
}
