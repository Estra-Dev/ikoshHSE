"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { RiskAssessmentRegister } from "@/components/risk-assessments/risk-assessment-register";

export default function RiskAssessmentsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading risk assessments..." />}>
      <RiskAssessmentRegister />
    </Suspense>
  );
}
