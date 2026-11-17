"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { InspectionForm } from "@/components/inspections/inspection-form";

export default function NewInspectionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Schedule inspection"
        description="Plan an HSE inspection, assign a responsible inspector and link it to a project or site."
        actions={
          <Link href="/inspections" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <InspectionForm />
    </div>
  );
}
