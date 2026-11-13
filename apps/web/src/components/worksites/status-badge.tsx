import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";

function toneForStatus(status: string): BadgeTone {
  switch (status) {
    case "ACTIVE":
      return "green";
    case "ON_HOLD":
      return "amber";
    case "COMPLETED":
      return "blue";
    case "CANCELLED":
    case "DECOMMISSIONED":
      return "red";
    default:
      return "neutral";
  }
}

/** Lifecycle badge shared by project and site screens. */
export function WorkSiteStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={toneForStatus(status)}>{formatHseLabel(status)}</Badge>
  );
}
