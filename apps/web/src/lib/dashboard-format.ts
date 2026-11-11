/** Deterministic formatting so pre-rendered and hydrated output match. */

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function toDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUtcDate(value: string): string {
  const date = toDate(value);
  return date ? DATE_FORMAT.format(date) : "—";
}

export function formatUtcTime(value: string): string {
  const date = toDate(value);
  return date ? TIME_FORMAT.format(date) : "—";
}

export function formatUtcDateTime(value: string): string {
  const date = toDate(value);
  return date ? `${DATE_TIME_FORMAT.format(date)} UTC` : "—";
}
