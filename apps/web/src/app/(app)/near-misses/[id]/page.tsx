"use client";

import { useParams } from "next/navigation";
import { IncidentDetail } from "@/components/incidents/incident-detail";

export default function NearMissDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <IncidentDetail
      incidentId={params.id}
      expectedType="NEAR_MISS"
      backHref="/near-misses"
      backLabel="Back to near-miss register"
    />
  );
}
