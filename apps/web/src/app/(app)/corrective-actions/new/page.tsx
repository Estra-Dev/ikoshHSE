"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner, buttonStyles } from "@/components/ui/feedback";
import { CorrectiveActionForm } from "@/components/corrective-actions/corrective-action-form";
import {
  CORRECTIVE_ACTION_SOURCES,
  type CorrectiveActionSource,
} from "@/lib/api/types";

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function isCorrectiveActionSource(
  value: string | null,
): value is CorrectiveActionSource {
  return (
    value !== null &&
    (CORRECTIVE_ACTION_SOURCES as readonly string[]).includes(value)
  );
}

/**
 * Creation route. A report's detail page may prefill `source` and
 * `incidentId`; invalid values are ignored so the form always opens safely.
 */
function NewCorrectiveActionContent() {
  const searchParams = useSearchParams();
  const rawSource = searchParams.get("source");
  const rawIncidentId = searchParams.get("incidentId");

  const initialSource = isCorrectiveActionSource(rawSource)
    ? rawSource
    : undefined;
  const initialIncidentId =
    rawIncidentId && OBJECT_ID_PATTERN.test(rawIncidentId)
      ? rawIncidentId
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Safety operations"
        title="New corrective action"
        description="Raise an action for an incident, near miss or HSE observation. Ownership, due date and evidence are tracked to closure."
        actions={
          <Link
            href="/corrective-actions"
            className={buttonStyles("secondary")}
          >
            Back to register
          </Link>
        }
      />

      <CorrectiveActionForm
        initialSource={initialSource}
        initialIncidentId={initialIncidentId}
      />
    </div>
  );
}

export default function NewCorrectiveActionPage() {
  return (
    <Suspense fallback={<Spinner label="Loading form..." />}>
      <NewCorrectiveActionContent />
    </Suspense>
  );
}
