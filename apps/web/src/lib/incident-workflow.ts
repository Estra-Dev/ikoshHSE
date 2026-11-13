import type { IncidentStatus, IncidentType } from "./api/types";

/**
 * Client mirror of the incident workflow rules. The API remains authoritative;
 * these helpers only decide which transition controls are offered.
 */

export const INCIDENT_STATUS_TRANSITIONS: Record<
  IncidentStatus,
  readonly IncidentStatus[]
> = {
  REPORTED: ["TRIAGED"],
  TRIAGED: ["CLOSED"],
  CLOSED: [],
};

export function nextIncidentStatuses(
  status: IncidentStatus,
): readonly IncidentStatus[] {
  return INCIDENT_STATUS_TRANSITIONS[status];
}

export function isIncidentStatusTerminal(status: IncidentStatus): boolean {
  return INCIDENT_STATUS_TRANSITIONS[status].length === 0;
}

/** Canonical detail route for a report type. */
export function incidentDetailHref(
  type: IncidentType,
  incidentId: string,
): string {
  const base = type === "NEAR_MISS" ? "/near-misses" : "/incidents";
  return `${base}/${incidentId}`;
}

/** Canonical register route for a report type. */
export function incidentRegisterHref(type: IncidentType): string {
  return type === "NEAR_MISS" ? "/near-misses" : "/incidents";
}

/** Canonical report-form route for a report type. */
export function incidentReportHref(type: IncidentType): string {
  return type === "NEAR_MISS" ? "/near-misses/new" : "/incidents/new";
}
