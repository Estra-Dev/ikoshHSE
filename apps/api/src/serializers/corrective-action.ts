export interface CorrectiveActionLike {
  _id: unknown;
  description: string;
  source: string;
  incident?: unknown;
  project: unknown;
  site?: unknown;
  assignedTo: unknown;
  dueDate: Date;
  status: string;
  completionNotes?: string | null;
  completedAt?: Date | null;
  completedBy?: unknown;
  verificationNotes?: string | null;
  verifiedAt?: Date | null;
  verifiedBy?: unknown;
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

export interface IncidentRef {
  id: string;
  type: string | null;
  title: string | null;
}

export interface SerializedCorrectiveAction {
  id: string;
  description: string;
  source: string;
  incident: IncidentRef | null;
  project: ProjectRef;
  site: SiteRef | null;
  assignedTo: UserRef;
  dueDate: string;
  status: string;
  completionNotes: string | null;
  completedAt: string | null;
  completedBy: UserRef | null;
  verificationNotes: string | null;
  verifiedAt: string | null;
  verifiedBy: UserRef | null;
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
  type?: string | null;
  title?: string | null;
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

/**
 * Whitelists corrective action response fields and flattens populated
 * references into display-safe objects. Free-text completion/verification
 * notes are business data (not personal data), so they remain visible.
 */
export function toCorrectiveActionSummary(
  action: CorrectiveActionLike,
): SerializedCorrectiveAction {
  const project = asDocument(action.project);
  const site = asDocument(action.site);
  const incident = asDocument(action.incident);

  return {
    id: String(action._id),
    description: action.description,
    source: action.source,
    incident: incident
      ? {
          id: String(incident._id),
          type: incident.type ?? null,
          title: incident.title ?? null,
        }
      : null,
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
    assignedTo: userRef(action.assignedTo) ?? {
      id: "",
      firstName: "",
      lastName: "",
    },
    dueDate: action.dueDate.toISOString(),
    status: action.status,
    completionNotes: action.completionNotes ?? null,
    completedAt: dateOf(action.completedAt),
    completedBy: userRef(action.completedBy),
    verificationNotes: action.verificationNotes ?? null,
    verifiedAt: dateOf(action.verifiedAt),
    verifiedBy: userRef(action.verifiedBy),
    createdBy: userRef(action.createdBy),
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}
