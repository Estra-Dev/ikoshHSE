"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { AuditRegister } from "@/components/audits/audit-register";

export default function AuditsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading audits..." />}>
      <AuditRegister />
    </Suspense>
  );
}
