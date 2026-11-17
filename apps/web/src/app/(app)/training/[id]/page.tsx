"use client";

import { useParams } from "next/navigation";
import { TrainingDetail } from "@/components/training/training-detail";

export default function TrainingDetailPage() {
  const params = useParams<{ id: string }>();

  return <TrainingDetail sessionId={params.id} />;
}
