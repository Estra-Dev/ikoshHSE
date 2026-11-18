"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { HseReports } from "@/components/reports/hse-reports";

export default function ReportsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading HSE reports..." />}>
      <HseReports />
    </Suspense>
  );
}
