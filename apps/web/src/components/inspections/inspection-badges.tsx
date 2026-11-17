import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";
import type {
  InspectionSeverity,
  InspectionStatus,
  InspectionType,
} from "@/lib/api/types";

const STATUS_TONES: Record<InspectionStatus, BadgeTone> = {
  SCHEDULED: "blue",
  IN_PROGRESS: "amber",
  COMPLETED: "green",
  CANCELLED: "neutral",
};

const TYPE_TONES: Record<InspectionType, BadgeTone> = {
  ROUTINE: "navy",
  FOCUSED: "blue",
  FOLLOW_UP: "violet",
};

const SEVERITY_TONES: Record<InspectionSeverity, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "amber",
  HIGH: "red",
  CRITICAL: "red",
};

export function InspectionStatusBadge({
  status,
}: {
  status: InspectionStatus;
}) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {formatHseLabel(status)}
    </Badge>
  );
}

export function InspectionTypeBadge({ type }: { type: InspectionType }) {
  return <Badge tone={TYPE_TONES[type]}>{formatHseLabel(type)}</Badge>;
}

export function InspectionSeverityBadge({
  severity,
}: {
  severity: InspectionSeverity;
}) {
  return <Badge tone={SEVERITY_TONES[severity]}>{formatHseLabel(severity)}</Badge>;
}

export function InspectionOverdueBadge() {
  return <Badge tone="red">Overdue</Badge>;
}
