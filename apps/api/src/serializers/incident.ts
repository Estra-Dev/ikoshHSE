export interface IncidentLike {
  _id: unknown;
  site: unknown;
  reportedBy: unknown;
  type: string;
  title: string;
  description: string;
  occurredAt: Date;
  location?: string | null;
  immediateActions?: string | null;
  category?: string | null;
  status: string;
  classifiedBy?: unknown | null;
  classifiedAt?: Date | null;
  statusUpdatedBy?: unknown | null;
  statusUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedIncident {
  id: string;
  site: { id: string };
  /** Null when the viewer is not entitled to the reporter's identity. */
  reportedBy: { id: string } | null;
  type: string;
  title: string;
  description: string;
  occurredAt: string;
  location: string | null;
  /** Null when the viewer is not entitled to investigation details. */
  immediateActions: string | null;
  category: string | null;
  status: string;
  classifiedBy: { id: string } | null;
  classifiedAt: string | null;
  statusUpdatedBy: { id: string } | null;
  statusUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentSerializationOptions {
  /**
   * Defaults to `true` for internal callers. Routes pass `false` when an
   * ordinary employee is reading a colleague's report, which withholds the
   * reporter/workflow identities and immediate actions.
   */
  full?: boolean;
}

function dateOf(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/**
 * Whitelists incident response fields. Only identifiers are exposed for
 * related records so no employee personal data leaks through incident
 * responses. Redacted summaries keep the safety facts while withholding
 * reporter identity, workflow actors and immediate actions.
 */
export function toIncidentSummary(
  incident: IncidentLike,
  options: IncidentSerializationOptions = {},
): SerializedIncident {
  const full = options.full !== false;

  return {
    id: String(incident._id),
    site: { id: String(incident.site) },
    reportedBy: full ? { id: String(incident.reportedBy) } : null,
    type: incident.type,
    title: incident.title,
    description: incident.description,
    occurredAt: incident.occurredAt.toISOString(),
    location: incident.location ?? null,
    immediateActions: full ? (incident.immediateActions ?? null) : null,
    category: incident.category ?? null,
    status: incident.status,
    classifiedBy:
      full && incident.classifiedBy
        ? { id: String(incident.classifiedBy) }
        : null,
    classifiedAt: full ? dateOf(incident.classifiedAt) : null,
    statusUpdatedBy:
      full && incident.statusUpdatedBy
        ? { id: String(incident.statusUpdatedBy) }
        : null,
    statusUpdatedAt: full ? dateOf(incident.statusUpdatedAt) : null,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
}
