"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { IncidentRegister } from "@/components/incidents/incident-register";

export default function IncidentsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading incident register..." />}>
      <IncidentRegister mode="incidents" />
    </Suspense>
  );
}
