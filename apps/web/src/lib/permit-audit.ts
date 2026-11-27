export const PERMIT_AUDIT_ACTIVITY_LIMIT = 50;

export interface PermitAuditEntryLike {
  action: string;
  actor?: { id?: string; firstName?: string; lastName?: string } | null;
  createdAt: string | Date;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface PermitAuditChange {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface PermitAuditSummary {
  actionLabel: string;
  changes: PermitAuditChange[];
}

const ACTION_LABELS: Record<string, string> = {
  "permit.created": "Created",
  "permit.updated": "Updated",
  "permit.status_changed": "Status changed",
  "permit.readiness_recorded": "Readiness recorded",
  "permit.monitoring_check_recorded": "Monitoring check recorded",
  "permit.revalidation_recorded": "Revalidation recorded",
};

/**
 * Only fields appropriate to each event are eligible for display.
 * Never display arbitrary audit snapshot keys.
 */
const ACTION_FIELDS: Record<string, readonly string[]> = {
  "permit.created": ["status", "workType", "validFrom", "validTo"],

  "permit.updated": [
    "project",
    "site",
    "workType",
    "validFrom",
    "validTo",
    "responsiblePerson",
    "workerCount",
    "precautionCount",
    "hazardCount",
  ],

  "permit.status_changed": ["status"],

  "permit.readiness_recorded": [
    "personnelCount",
    "equipmentCount",
    "isolationCount",
    "gasTestCount",
    "worksiteVerificationHistoryCount",
    "attestationCount",
  ],

  "permit.monitoring_check_recorded": [
    "recordId",
    "permitId",
    "projectId",
    "siteId",
    "type",
    "attachmentCount",
  ],

  "permit.revalidation_recorded": [
    "recordId",
    "permitId",
    "projectId",
    "siteId",
    "type",
    "attachmentCount",
  ],
};

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  workType: "Work type",
  validFrom: "Valid from",
  validTo: "Valid to",
  project: "Project",
  site: "Site",
  responsiblePerson: "Responsible person",
  workerCount: "Worker count",
  precautionCount: "Precaution count",
  hazardCount: "Hazard count",
  personnelCount: "Personnel count",
  equipmentCount: "Equipment count",
  isolationCount: "Isolation count",
  gasTestCount: "Gas test count",
  worksiteVerificationHistoryCount: "Worksite verification count",
  attestationCount: "Attestation count",
  recordId: "Record ID",
  permitId: "Permit ID",
  projectId: "Project ID",
  siteId: "Site ID",
  type: "Type",
  attachmentCount: "Attachment count",
};

function readableValue(value: string): string {
  const specialLabels: Record<string, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    APPROVED: "Approved",
    ACTIVE: "Active",
    SUSPENDED: "Suspended",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
    CLOSED: "Closed",
    HOT_WORK: "Hot work",
    COLD_WORK: "Cold work",
    CONFINED_SPACE: "Confined space",
    MONITORING_CHECK: "Monitoring check",
    REVALIDATION: "Revalidation",
  };

  if (specialLabels[value]) return specialLabels[value];

  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatScalar(key: string, value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (!value.trim()) {
    return null;
  }

  if (key === "validFrom" || key === "validTo") {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return `${new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date)} UTC`;
  }

  return readableValue(value);
}

export function permitAuditActionLabel(action: string): string {
  const knownLabel = ACTION_LABELS[action];

  if (knownLabel) {
    return knownLabel;
  }

  const eventName = action.split(".").pop() ?? action;

  return readableValue(eventName);
}

export function summarizePermitAuditEntry(
  entry: PermitAuditEntryLike,
): PermitAuditSummary {
  const allowedFields = ACTION_FIELDS[entry.action] ?? [];
  const changes: PermitAuditChange[] = [];

  for (const key of allowedFields) {
    const beforeExists =
      entry.before !== null &&
      entry.before !== undefined &&
      Object.prototype.hasOwnProperty.call(entry.before, key);

    const afterExists =
      entry.after !== null &&
      entry.after !== undefined &&
      Object.prototype.hasOwnProperty.call(entry.after, key);

    const before = beforeExists ? formatScalar(key, entry.before?.[key]) : null;

    const after = afterExists ? formatScalar(key, entry.after?.[key]) : null;

    if (before === after) {
      continue;
    }

    if (before === null && after === null) {
      continue;
    }

    changes.push({
      key,
      label: FIELD_LABELS[key] ?? readableValue(key),
      before,
      after,
    });
  }

  return {
    actionLabel: permitAuditActionLabel(entry.action),
    changes,
  };
}
