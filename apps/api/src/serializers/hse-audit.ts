export interface AuditChecklistItemLike {
  _id: unknown;
  item: string;
  result: string;
  notes?: string | null;
}

export interface AuditFindingLike {
  _id: unknown;
  description: string;
  severity: string;
  recommendation?: string | null;
  correctiveAction?: unknown;
  createdAt: Date;
}

export interface HseAuditLike {
  _id: unknown;
  title: string;
  type: string;
  status: string;
  project: unknown;
  site?: unknown;
  auditors?: readonly unknown[];
  scheduledFor: Date;
  description?: string | null;
  completionNotes?: string | null;
  completedAt?: Date | null;
  completedBy?: unknown;
  checklist?: readonly AuditChecklistItemLike[];
  findings?: readonly AuditFindingLike[];
  createdBy?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ProjectRef {
  id: string;
  name: string | null;
}

export interface SiteRef {
  id: string;
  name: string | null;
  code: string | null;
}

export interface CorrectiveActionRef {
  id: string;
  description: string | null;
  status: string | null;
}

export interface SerializedAuditChecklistItem {
  id: string;
  item: string;
  result: string;
  notes: string;
}

export interface SerializedAuditFinding {
  id: string;
  description: string;
  severity: string;
  recommendation: string | null;
  correctiveAction: CorrectiveActionRef | null;
  createdAt: string;
}

export interface SerializedHseAudit {
  id: string;
  title: string;
  type: string;
  status: string;
  project: ProjectRef;
  site: SiteRef | null;
  auditors: UserRef[];
  scheduledFor: string;
  description: string;
  completionNotes: string | null;
  completedAt: string | null;
  completedBy: UserRef | null;
  checklist: SerializedAuditChecklistItem[];
  findings: SerializedAuditFinding[];
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

interface RefDocument {
  _id: unknown;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  code?: string | null;
  description?: string | null;
  status?: string | null;
}

function asDocument(value: unknown): RefDocument | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && "_id" in value) {
    return value as RefDocument;
  }

  return { _id: value };
}

function dateOf(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function userRef(value: unknown): UserRef | null {
  const document = asDocument(value);

  if (!document) {
    return null;
  }

  return {
    id: String(document._id),
    firstName: document.firstName ?? "",
    lastName: document.lastName ?? "",
  };
}

function checklistRef(
  item: AuditChecklistItemLike,
): SerializedAuditChecklistItem {
  return {
    id: String(item._id),
    item: item.item,
    result: item.result,
    notes: item.notes ?? "",
  };
}

function findingRef(finding: AuditFindingLike): SerializedAuditFinding {
  const action = asDocument(finding.correctiveAction);

  return {
    id: String(finding._id),
    description: finding.description,
    severity: finding.severity,
    recommendation: finding.recommendation ?? null,
    correctiveAction: action
      ? {
          id: String(action._id),
          description: action.description ?? null,
          status: action.status ?? null,
        }
      : null,
    createdAt: finding.createdAt.toISOString(),
  };
}

/**
 * Whitelists HSE audit response fields and flattens populated references into
 * display-safe objects. Checklist text, notes, findings and completion notes
 * are business data, so they remain visible to authorized viewers.
 */
export function toHseAuditSummary(audit: HseAuditLike): SerializedHseAudit {
  const project = asDocument(audit.project);
  const site = asDocument(audit.site);
  const auditors = (audit.auditors ?? [])
    .map((auditor) => userRef(auditor))
    .filter((auditor): auditor is UserRef => auditor !== null);

  return {
    id: String(audit._id),
    title: audit.title,
    type: audit.type,
    status: audit.status,
    project: {
      id: project ? String(project._id) : "",
      name: project?.name ?? null,
    },
    site: site
      ? {
          id: String(site._id),
          name: site.name ?? null,
          code: site.code ?? null,
        }
      : null,
    auditors,
    scheduledFor: audit.scheduledFor.toISOString(),
    description: audit.description ?? "",
    completionNotes: audit.completionNotes ?? null,
    completedAt: dateOf(audit.completedAt),
    completedBy: userRef(audit.completedBy),
    checklist: (audit.checklist ?? []).map(checklistRef),
    findings: (audit.findings ?? []).map(findingRef),
    createdBy: userRef(audit.createdBy),
    createdAt: audit.createdAt.toISOString(),
    updatedAt: audit.updatedAt.toISOString(),
  };
}
