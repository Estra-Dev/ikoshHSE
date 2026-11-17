"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { AuditForm } from "@/components/audits/audit-form";

export default function NewAuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="New HSE audit"
        description="Schedule an internal, external, supplier or certification audit, assign one or more HSE auditors and prepare an optional checklist."
        actions={
          <Link href="/audits" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <AuditForm />
    </div>
  );
}
