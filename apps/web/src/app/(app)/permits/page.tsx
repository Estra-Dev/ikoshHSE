"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { PermitRegister } from "@/components/permits/permit-register";

export default function PermitsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading permits..." />}>
      <PermitRegister />
    </Suspense>
  );
}
