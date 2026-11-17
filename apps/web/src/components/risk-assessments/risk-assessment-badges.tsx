import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";
import type { RiskAssessmentStatus, RiskLevel } from "@/lib/api/types";

const STATUS_TONES: Record<RiskAssessmentStatus, BadgeTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "amber",
  APPROVED: "green",
  ARCHIVED: "navy",
};

const RISK_LEVEL_TONES: Record<RiskLevel, BadgeTone> = {
  LOW: "green",
  MEDIUM: "amber",
  HIGH: "red",
  CRITICAL: "red",
};

export function RiskAssessmentStatusBadge({
  status,
}: {
  status: RiskAssessmentStatus;
}) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {formatHseLabel(status)}
    </Badge>
  );
}

export function RiskLevelBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge tone={RISK_LEVEL_TONES[level]} dot>
      {formatHseLabel(level)}
    </Badge>
  );
}
