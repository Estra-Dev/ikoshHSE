"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { TrainingForm } from "@/components/training/training-form";

export default function NewTrainingSessionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="Schedule training"
        description="Plan an HSE training session at an active site, record the trainer and invite employees and contractor personnel."
        actions={
          <Link href="/training" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <TrainingForm />
    </div>
  );
}
