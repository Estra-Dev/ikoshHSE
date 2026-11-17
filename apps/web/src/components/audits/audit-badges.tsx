import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatHseLabel } from "@/lib/hse-dashboard";
import type {
  AuditChecklistResult,
  AuditFindingSeverity,
  AuditStatus,
  AuditType,
} from "@/lib/api/types";

const STATUS_TONES: Record<AuditStatus, BadgeTone> = {
  PLANNED: "blue",
  IN_PROGRESS: "amber",
  COMPLETED: "green",
  CANCELLED: "neutral",
};

const TYPE_TONES: Record<AuditType, BadgeTone> = {
  INTERNAL: "navy",
  EXTERNAL: "blue",
  SUPPLIER: "violet",
  CERTIFICATION: "amber",
};

const SEVERITY_TONES: Record<AuditFindingSeverity, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "amber",
  HIGH: "red",
  CRITICAL: "red",
};

const CHECKLIST_TONES: Record<AuditChecklistResult, BadgeTone> = {
  PENDING: "neutral",
  COMPLIANT: "green",
  NON_COMPLIANT: "red",
  NOT_APPLICABLE: "navy",
};

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {formatHseLabel(status)}
    </Badge>
  );
}

export function AuditTypeBadge({ type }: { type: AuditType }) {
  return <Badge tone={TYPE_TONES[type]}>{formatHseLabel(type)}</Badge>;
}

export function AuditSeverityBadge({
  severity,
}: {
  severity: AuditFindingSeverity;
}) {
  return (
    <Badge tone={SEVERITY_TONES[severity]}>
      {formatHseLabel(severity)}
    </Badge>
  );
}

export function AuditChecklistResultBadge({
  result,
}: {
  result: AuditChecklistResult;
}) {
  return (
    <Badge tone={CHECKLIST_TONES[result]}>{formatHseLabel(result)}</Badge>
  );
}

export function AuditOverdueBadge() {
  return <Badge tone="red">Overdue</Badge>;
}
