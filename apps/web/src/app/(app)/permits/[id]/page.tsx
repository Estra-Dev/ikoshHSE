"use client";

import { useParams } from "next/navigation";
import { PermitDetail } from "@/components/permits/permit-detail";

export default function PermitDetailPage() {
  const params = useParams<{ id: string }>();

  return <PermitDetail permitId={params.id} />;
}
