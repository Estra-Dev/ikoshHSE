"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { PermitForm } from "@/components/permits/permit-form";

export default function NewPermitPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="Raise permit"
        description="Authorise work on an active site, assign a responsible person and record the hazards, controls and precautions."
        actions={
          <Link href="/permits" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <PermitForm />
    </div>
  );
}
