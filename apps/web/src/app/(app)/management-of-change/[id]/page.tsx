"use client";

import { useParams } from "next/navigation";
import { ManagementOfChangeDetail } from "@/components/management-of-change/management-of-change-detail";

export default function ManagementOfChangeDetailPage() {
  const params = useParams<{ id: string }>();

  return <ManagementOfChangeDetail id={params.id} />;
}
