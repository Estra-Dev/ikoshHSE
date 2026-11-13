import type {
  CreateIncidentInput,
  IncidentSummary,
  IncidentType,
  UpdateIncidentInput,
} from "./api/types";

/**
 * Pure report-form helpers shared by the create and edit flows.
 *
 * The API treats blank optional fields as "not supplied". Edit forms therefore
 * never send an empty location or immediate-action value, because the backend
 * schema cannot store an empty optional string.
 */

export interface IncidentFormValues {
  siteId: string;
  type: IncidentType;
  title: string;
  description: string;
  /** Value from a `datetime-local` input, not an ISO timestamp. */
  occurredAt: string;
  location: string;
  immediateActions: string;
}

export type IncidentFormErrors = Partial<
  Record<keyof IncidentFormValues, string>
>;

export const INCIDENT_TITLE_MAX = 160;
export const INCIDENT_DESCRIPTION_MAX = 5000;
export const INCIDENT_LOCATION_MAX = 200;
export const INCIDENT_IMMEDIATE_ACTIONS_MAX = 2000;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Converts an ISO timestamp to the local value a `datetime-local` expects. */
export function toDateTimeLocalValue(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converts a `datetime-local` value to an ISO timestamp, or `null`. */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function defaultIncidentFormValues(
  type: IncidentType,
  now: Date = new Date(),
): IncidentFormValues {
  return {
    siteId: "",
    type,
    title: "",
    description: "",
    occurredAt: toDateTimeLocalValue(now.toISOString()),
    location: "",
    immediateActions: "",
  };
}

export function incidentToFormValues(
  incident: IncidentSummary,
): IncidentFormValues {
  return {
    siteId: incident.site.id,
    type: incident.type,
    title: incident.title,
    description: incident.description,
    occurredAt: toDateTimeLocalValue(incident.occurredAt),
    location: incident.location ?? "",
    immediateActions: incident.immediateActions ?? "",
  };
}

export function validateIncidentForm(
  values: IncidentFormValues,
  { requireSite }: { requireSite: boolean },
): IncidentFormErrors {
  const errors: IncidentFormErrors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const location = values.location.trim();
  const immediateActions = values.immediateActions.trim();

  if (requireSite && !OBJECT_ID_PATTERN.test(values.siteId)) {
    errors.siteId = "Select the site where the report occurred.";
  }

  if (!title) {
    errors.title = "Enter a short title for the report.";
  } else if (title.length > INCIDENT_TITLE_MAX) {
    errors.title = `Keep the title to ${INCIDENT_TITLE_MAX} characters or fewer.`;
  }

  if (!description) {
    errors.description = "Describe what happened.";
  } else if (description.length > INCIDENT_DESCRIPTION_MAX) {
    errors.description = `Keep the description to ${INCIDENT_DESCRIPTION_MAX} characters or fewer.`;
  }

  if (!fromDateTimeLocalValue(values.occurredAt)) {
    errors.occurredAt = "Enter a valid date and time.";
  }

  if (location.length > INCIDENT_LOCATION_MAX) {
    errors.location = `Keep the location to ${INCIDENT_LOCATION_MAX} characters or fewer.`;
  }

  if (immediateActions.length > INCIDENT_IMMEDIATE_ACTIONS_MAX) {
    errors.immediateActions = `Keep immediate actions to ${INCIDENT_IMMEDIATE_ACTIONS_MAX} characters or fewer.`;
  }

  return errors;
}

/**
 * Builds a create payload. Required values are validated first; blank optional
 * fields are omitted entirely instead of being sent as empty strings.
 */
export function buildCreateIncidentInput(
  values: IncidentFormValues,
): CreateIncidentInput {
  const occurredAt = fromDateTimeLocalValue(values.occurredAt);

  if (!occurredAt) {
    throw new Error("A valid occurrence date and time is required.");
  }

  const input: CreateIncidentInput = {
    siteId: values.siteId.trim(),
    type: values.type,
    title: values.title.trim(),
    description: values.description.trim(),
    occurredAt,
  };

  const location = values.location.trim();
  const immediateActions = values.immediateActions.trim();

  if (location) {
    input.location = location;
  }

  if (immediateActions) {
    input.immediateActions = immediateActions;
  }

  return input;
}

/**
 * Builds a content-update payload. The site is immutable and never sent,
 * classification/status have dedicated endpoints, and blank optional values
 * are omitted so the API leaves the stored value unchanged.
 */
export function buildUpdateIncidentInput(
  values: IncidentFormValues,
): UpdateIncidentInput {
  const occurredAt = fromDateTimeLocalValue(values.occurredAt);

  if (!occurredAt) {
    throw new Error("A valid occurrence date and time is required.");
  }

  const input: UpdateIncidentInput = {
    type: values.type,
    title: values.title.trim(),
    description: values.description.trim(),
    occurredAt,
  };

  const location = values.location.trim();
  const immediateActions = values.immediateActions.trim();

  if (location) {
    input.location = location;
  }

  if (immediateActions) {
    input.immediateActions = immediateActions;
  }

  return input;
}
