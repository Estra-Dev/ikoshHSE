"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/feedback";
import { TrainingCourseManager } from "@/components/training/training-course-manager";

export default function TrainingCoursesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assurance"
        title="Training courses"
        description="Maintain the reusable HSE course catalogue used when scheduling sessions."
        actions={
          <Link href="/training" className={buttonStyles("secondary")}>
            Back to register
          </Link>
        }
      />

      <TrainingCourseManager />
    </div>
  );
}
