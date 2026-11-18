"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { PpeRegister } from "@/components/ppe/ppe-register";

export default function PpePage() {
  return (
    <Suspense fallback={<Spinner label="Loading PPE management..." />}>
      <PpeRegister />
    </Suspense>
  );
}
