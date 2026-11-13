"use client";

import { useParams } from "next/navigation";
import { IncidentDetail } from "@/components/incidents/incident-detail";

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();

  return (
    <IncidentDetail
      incidentId={params.id}
      backHref="/incidents"
      backLabel="Back to incident register"
    />
  );
}
