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
  reportedBy: { id: string };
  type: string;
  title: string;
  description: string;
  occurredAt: string;
  location: string | null;
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

function dateOf(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/**
 * Whitelists incident response fields. Only identifiers are exposed for
 * related records so no employee personal data leaks through incident
 * responses.
 */
export function toIncidentSummary(incident: IncidentLike): SerializedIncident {
  return {
    id: String(incident._id),
    site: { id: String(incident.site) },
    reportedBy: { id: String(incident.reportedBy) },
    type: incident.type,
    title: incident.title,
    description: incident.description,
    occurredAt: incident.occurredAt.toISOString(),
    location: incident.location ?? null,
    immediateActions: incident.immediateActions ?? null,
    category: incident.category ?? null,
    status: incident.status,
    classifiedBy: incident.classifiedBy
      ? { id: String(incident.classifiedBy) }
      : null,
    classifiedAt: dateOf(incident.classifiedAt),
    statusUpdatedBy: incident.statusUpdatedBy
      ? { id: String(incident.statusUpdatedBy) }
      : null,
    statusUpdatedAt: dateOf(incident.statusUpdatedAt),
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
}
