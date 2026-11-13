import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { IncidentStatus, IncidentType } from "@/lib/api/types";
import { formatHseLabel } from "@/lib/hse-dashboard";

const STATUS_TONES: Record<IncidentStatus, BadgeTone> = {
  REPORTED: "amber",
  TRIAGED: "blue",
  CLOSED: "green",
};

const TYPE_TONES: Record<IncidentType, BadgeTone> = {
  INCIDENT: "red",
  NEAR_MISS: "blue",
};

export function IncidentTypeBadge({ type }: { type: IncidentType }) {
  return (
    <Badge tone={TYPE_TONES[type]} dot>
      {formatHseLabel(type)}
    </Badge>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]}>{formatHseLabel(status)}</Badge>
  );
}

export function IncidentCategoryBadge({ category }: { category: string }) {
  return <Badge tone="violet">{formatHseLabel(category)}</Badge>;
}
