export interface InspectionFindingLike {
  _id: unknown;
  description: string;
  severity: string;
  recommendation?: string | null;
  correctiveAction?: unknown;
  createdAt: Date;
}

export interface InspectionLike {
  _id: unknown;
  title: string;
  type: string;
  status: string;
  project: unknown;
  site?: unknown;
  inspector: unknown;
  scheduledFor: Date;
  description?: string | null;
  completionNotes?: string | null;
  completedAt?: Date | null;
  completedBy?: unknown;
  findings?: readonly InspectionFindingLike[];
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

export interface SerializedInspectionFinding {
  id: string;
  description: string;
  severity: string;
  recommendation: string | null;
  correctiveAction: CorrectiveActionRef | null;
  createdAt: string;
}

export interface SerializedInspection {
  id: string;
  title: string;
  type: string;
  status: string;
  project: ProjectRef;
  site: SiteRef | null;
  inspector: UserRef;
  scheduledFor: string;
  description: string;
  completionNotes: string | null;
  completedAt: string | null;
  completedBy: UserRef | null;
  findings: SerializedInspectionFinding[];
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

function findingRef(finding: InspectionFindingLike): SerializedInspectionFinding {
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
 * Whitelists inspection response fields and flattens populated references into
 * display-safe objects. Descriptions, recommendations and completion notes are
 * business data, so they remain visible to authorized viewers.
 */
export function toInspectionSummary(
  inspection: InspectionLike,
): SerializedInspection {
  const project = asDocument(inspection.project);
  const site = asDocument(inspection.site);

  return {
    id: String(inspection._id),
    title: inspection.title,
    type: inspection.type,
    status: inspection.status,
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
    inspector: userRef(inspection.inspector) ?? {
      id: "",
      firstName: "",
      lastName: "",
    },
    scheduledFor: inspection.scheduledFor.toISOString(),
    description: inspection.description ?? "",
    completionNotes: inspection.completionNotes ?? null,
    completedAt: dateOf(inspection.completedAt),
    completedBy: userRef(inspection.completedBy),
    findings: (inspection.findings ?? []).map(findingRef),
    createdBy: userRef(inspection.createdBy),
    createdAt: inspection.createdAt.toISOString(),
    updatedAt: inspection.updatedAt.toISOString(),
  };
}
