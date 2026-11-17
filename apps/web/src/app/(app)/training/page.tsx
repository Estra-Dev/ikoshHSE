"use client";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { TrainingPage } from "@/components/training/training-page";

export default function TrainingIndexPage() {
  return (
    <Suspense fallback={<Spinner label="Loading training..." />}>
      <TrainingPage />
    </Suspense>
  );
}
