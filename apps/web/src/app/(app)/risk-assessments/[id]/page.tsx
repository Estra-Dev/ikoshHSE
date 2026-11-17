"use client";

import { useParams } from "next/navigation";
import { RiskAssessmentDetail } from "@/components/risk-assessments/risk-assessment-detail";

export default function RiskAssessmentDetailPage() {
  const params = useParams<{ id: string }>();

  return <RiskAssessmentDetail assessmentId={params.id} />;
}
