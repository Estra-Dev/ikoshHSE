"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { IncidentReportForm } from "@/components/incidents/incident-report-form";

export default function NewNearMissPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Report a near miss"
        description="Record an event that could have caused harm but did not. Near-miss reports stay in the dedicated near-miss register."
        actions={
          <Link href="/near-misses" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <IncidentReportForm mode="create" lockedType="NEAR_MISS" />
    </div>
  );
}
