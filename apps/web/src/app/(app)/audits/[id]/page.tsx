"use client";

import { useParams } from "next/navigation";
import { AuditDetail } from "@/components/audits/audit-detail";

export default function AuditDetailPage() {
  const params = useParams<{ id: string }>();

  return <AuditDetail auditId={params.id} />;
}
