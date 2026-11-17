"use client";

import { AttachmentsPanel } from "@/components/attachments/attachments-panel";

/**
 * Evidence panel for one incident. Kept as a thin wrapper so incident detail
 * keeps its existing API while sharing upload and preview behavior with
 * corrective actions.
 */
export function IncidentAttachments({ incidentId }: { incidentId: string }) {
  return (
    <AttachmentsPanel
      entityType="incident"
      entityId={incidentId}
      title="Evidence attachments"
      description="Photographs and documents linked to this report. Access is scoped by the API."
      emptyMessage="No evidence has been attached to this report yet."
      canUpload
    />
  );
}
