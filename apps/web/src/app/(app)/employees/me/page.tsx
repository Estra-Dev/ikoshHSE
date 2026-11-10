"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ErrorState, Spinner } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/fields";
import {
  formatEnum,
  formatProfileDate,
  ProfileField,
  SectionCard,
} from "@/components/employees/profile-section";
import { useMe, useUpdateOwnProfile } from "@/lib/api/employees";
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
        Contact details
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
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
            <p className="text-sm text-green-700 dark:text-green-400">
              {feedback}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

export default function MyProfilePage() {
  const me = useMe();

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            My Profile
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your IKOSH employee record as stored in the directory.
          </p>
        </div>

        <Link
          href="/employees"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back to directory
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-zinc-900 dark:text-white">
              {formatName(employee)}
            </p>
            <p className="text-sm text-zinc-500">
              {employee.jobTitle ?? "No job title recorded"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="violet">{formatEnum(employee.ikoshRole)}</Badge>
            <Badge
              tone={employee.isActive ? "green" : "red"}
            >
              {employee.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge tone={employee.emailVerified ? "green" : "amber"}>
              {employee.emailVerified ? "Email verified" : "Email unverified"}
            </Badge>
          </div>
        </div>
      </section>

      <ContactForm key={employee.updatedAt} employee={employee} />

      <SectionCard
        title="Employment information"
        description="Managed by IKOSH administrators. Contact HR if anything needs correcting."
      >
        <ProfileField label="Employee ID" value={employee.employeeId ?? "—"} />
        <ProfileField
          label="Employment type"
          value={formatEnum(employee.employmentType)}
        />
        <ProfileField
          label="Hire date"
          value={formatProfileDate(employee.hireDate)}
        />
        <ProfileField
          label="Department"
          value={employee.department?.name ?? "—"}
        />
        <ProfileField
          label="Manager"
          value={
            employee.manager
              ? `${employee.manager.firstName} ${employee.manager.lastName}`
              : "—"
          }
        />
        <ProfileField
          label="Record created"
          value={formatProfileDate(employee.createdAt)}
        />
      </SectionCard>
    </div>
  );
}
