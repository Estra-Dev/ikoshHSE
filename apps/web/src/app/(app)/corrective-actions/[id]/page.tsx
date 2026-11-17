"use client";

import { useParams } from "next/navigation";
import { CorrectiveActionDetail } from "@/components/corrective-actions/corrective-action-detail";

export default function CorrectiveActionDetailPage() {
  const params = useParams<{ id: string }>();

  return <CorrectiveActionDetail actionId={params.id} />;
}
