"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { InspectionRegister } from "@/components/inspections/inspection-register";

export default function InspectionsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading inspections..." />}>
      <InspectionRegister />
    </Suspense>
  );
}
