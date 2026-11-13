"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Button,
  buttonStyles,
  ErrorState,
  Spinner,
} from "@/components/ui/feedback";
import { TextField } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/page-header";
import { ArrowLeftIcon } from "@/components/icons";
import {
  formatEnum,
  SectionCard,
} from "@/components/employees/profile-section";
import { useMe, useUpdateOwnProfile } from "@/lib/api/employees";
import { useSites } from "@/lib/api/worksites";
import type { EmployeeFull } from "@/lib/api/types";

function formatName(employee: EmployeeFull): string {
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return name || "Unnamed employee";
}

/**
 * Contact-details form for the signed-in employee. Remounts (via `key`) from
 * fresh server data after every successful save.
 */
function ContactForm({ employee }: { employee: EmployeeFull }) {
  const updateProfile = useUpdateOwnProfile();

  const [phone, setPhone] = useState(employee.phone ?? "");
  const [location, setLocation] = useState(employee.location ?? "");
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = {
      phone: phone.trim() || null,
      location: location.trim() || null,
    };

    // Skip no-op saves so empty inputs do not clobber existing values.
    if (
      input.phone === (employee.phone ?? null) &&
      input.location === (employee.location ?? null)
    ) {
      setFeedback("No changes to save.");
      return;
    }

    setFeedback("");

    try {
      await updateProfile.mutateAsync(input);
      setFeedback("Contact details saved.");
    } catch {
      // Error message is rendered from the mutation state below.
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Contact details</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Update your own phone number and location. Other profile fields are
        managed by IKOSH administrators.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label="Phone"
          id="own-phone"
          type="tel"
          placeholder="+234 800 000 0000"
          value={phone}
          maxLength={30}
          onChange={(event) => setPhone(event.target.value)}
        />
        <TextField
          label="Location"
          id="own-location"
          type="text"
          placeholder="e.g. Lagos"
          value={location}
          maxLength={120}
          onChange={(event) => setLocation(event.target.value)}
        />

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? "Saving..." : "Save changes"}
          </Button>

          {updateProfile.isError && (
            <p className="text-sm text-red-600" role="alert">
              {updateProfile.error instanceof Error
                ? updateProfile.error.message
                : "Unable to save your details."}
            </p>
          )}

          {!updateProfile.isError && feedback && (
            <p className="text-sm text-emerald-700">{feedback}</p>
          )}
        </div>
      </form>
    </section>
  );
}

export default function MyProfilePage() {
  const me = useMe();
  const sitesQuery = useSites();

  if (me.isLoading) {
    return <Spinner label="Loading your profile..." />;
  }

  if (me.isError || !me.data) {
    return (
      <ErrorState
        title="Unable to load your IKOSH profile"
        message={me.error instanceof Error ? me.error.message : undefined}
      />
    );
  }

  const employee = me.data.employee;
  const siteMap = new Map(sitesQuery.data?.sites.map((s) => [s.id, s.name]));
  const assignedSiteNames = employee.assignedSites
    .map((id) => siteMap.get(id))
    .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="HSE"
        title="My HSE Profile"
        description="Your IKOSH HSE identity and access information."
        actions={
          <Link href="/dashboard" className={buttonStyles("secondary", "sm")}>
            <ArrowLeftIcon size={16} />
            Back to HSE dashboard
          </Link>
        }
      />

      <section className="rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-ink">
              {formatName(employee)}
            </p>
            <p className="text-sm text-muted">
              {employee.jobTitle ?? "No job title recorded"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="navy">{formatEnum(employee.ikoshRole)}</Badge>
            <Badge tone={employee.isActive ? "green" : "red"} dot>
              {employee.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge tone={employee.emailVerified ? "green" : "amber"}>
              {employee.emailVerified ? "Email verified" : "Email unverified"}
            </Badge>
          </div>
        </div>
      </section>

      <ContactForm key={employee.updatedAt} employee={employee} />

      {assignedSiteNames.length > 0 && (
        <SectionCard
          title="Assigned sites"
          description="Sites you have access to for HSE reporting."
        >
          {sitesQuery.isLoading ? (
            <p className="text-sm text-muted">Loading assigned sites...</p>
          ) : sitesQuery.isError ? (
            <p className="text-sm text-red-600">
              Unable to load site details. Your profile is still available.
            </p>
          ) : assignedSiteNames.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {assignedSiteNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              You currently have no sites assigned.
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}
