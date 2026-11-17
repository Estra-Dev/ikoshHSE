"use client";

import { useParams } from "next/navigation";
import { InspectionDetail } from "@/components/inspections/inspection-detail";

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();

  return <InspectionDetail inspectionId={params.id} />;
}
