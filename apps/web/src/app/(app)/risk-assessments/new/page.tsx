"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { RiskAssessmentForm } from "@/components/risk-assessments/risk-assessment-form";

export default function NewRiskAssessmentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="New risk assessment"
        description="Record the hazards for a project or site, rate their inherent and residual risk, and submit the draft for HSE management review."
        actions={
          <Link
            href="/risk-assessments"
            className={buttonStyles("secondary")}
          >
            Back to register
          </Link>
        }
      />

      <RiskAssessmentForm mode="create" />
    </div>
  );
}
