"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { IncidentRegister } from "@/components/incidents/incident-register";

export default function NearMissesPage() {
  return (
    <Suspense fallback={<Spinner label="Loading near-miss register..." />}>
      <IncidentRegister mode="near-misses" />
    </Suspense>
  );
}
