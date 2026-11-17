"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { CorrectiveActionRegister } from "@/components/corrective-actions/corrective-action-register";

export default function CorrectiveActionsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading corrective actions..." />}>
      <CorrectiveActionRegister />
    </Suspense>
  );
}
