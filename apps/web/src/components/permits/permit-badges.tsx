import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";
import type {
  PermitStatus,
  PermitWorkType,
  RiskAssessmentStatus,
} from "@/lib/api/types";

const STATUS_TONES: Record<PermitStatus, BadgeTone> = {
  DRAFT: "neutral",
  SUBMITTED: "blue",
  APPROVED: "violet",
  ACTIVE: "green",
  SUSPENDED: "amber",
  CLOSED: "navy",
  REJECTED: "red",
  CANCELLED: "neutral",
};

const WORK_TYPE_TONES: Record<PermitWorkType, BadgeTone> = {
  HOT_WORK: "red",
  COLD_WORK: "blue",
  CONFINED_SPACE_ENTRY: "violet",
  WORKING_AT_HEIGHT: "amber",
  ELECTRICAL_WORK: "amber",
  EXCAVATION: "amber",
  LIFTING_OPERATION: "blue",
  ENERGY_ISOLATION: "violet",
  RADIOGRAPHY: "red",
  PRESSURE_TEST: "blue",
  OTHER: "neutral",
};

export function PermitStatusBadge({ status }: { status: PermitStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {formatHseLabel(status)}
    </Badge>
  );
}

export function PermitWorkTypeBadge({ workType }: { workType: PermitWorkType }) {
  return (
    <Badge tone={WORK_TYPE_TONES[workType]}>
      {formatHseLabel(workType)}
    </Badge>
  );
}

export function PermitExpiredBadge() {
  return <Badge tone="red">Expired</Badge>;
}

/**
 * Linked assessments keep their historical state visible. An approved record
 * that is no longer current was superseded; any other status is history.
 */
export function PermitRiskAssessmentStateBadge({
  isCurrent,
  status,
}: {
  isCurrent: boolean;
  status: RiskAssessmentStatus | "";
}) {
  if (isCurrent) {
    return (
      <Badge tone="green" dot>
        Current
      </Badge>
    );
  }

  return (
    <Badge tone="neutral" dot>
      {status === "APPROVED" ? "Superseded" : "Historical"}
    </Badge>
  );
}
