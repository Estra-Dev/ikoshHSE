"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { IncidentReportForm } from "@/components/incidents/incident-report-form";

export default function NewIncidentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Report an incident"
        description="File an incident report for a site in your scope. Classification and workflow status are added by HSE management after submission."
        actions={
          <Link href="/incidents" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <IncidentReportForm mode="create" lockedType="INCIDENT" />
    </div>
  );
}
