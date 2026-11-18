import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";
import type {
  CorrectiveActionSource,
  CorrectiveActionStatus,
} from "@/lib/api/types";

const STATUS_TONES: Record<CorrectiveActionStatus, BadgeTone> = {
  OPEN: "amber",
  IN_PROGRESS: "blue",
  COMPLETED: "violet",
  VERIFIED: "green",
};

const SOURCE_TONES: Record<CorrectiveActionSource, BadgeTone> = {
  INCIDENT: "red",
  NEAR_MISS: "amber",
  HSE_OBSERVATION: "blue",
  INSPECTION: "violet",
  HSE_AUDIT: "navy",
  RISK_ASSESSMENT: "violet",
  OTHER: "neutral",
};

export function CorrectiveActionStatusBadge({
  status,
}: {
  status: CorrectiveActionStatus;
}) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {formatHseLabel(status)}
    </Badge>
  );
}

export function CorrectiveActionSourceBadge({
  source,
}: {
  source: CorrectiveActionSource;
}) {
  return <Badge tone={SOURCE_TONES[source]}>{formatHseLabel(source)}</Badge>;
}

export function OverdueBadge() {
  return <Badge tone="red">Overdue</Badge>;
}
