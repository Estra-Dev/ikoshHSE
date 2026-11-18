import type { HseReport } from "./api/types";

export interface ReportFilterState {
  projectId: string;
  siteId: string;
  from: string;
  to: string;
}

export const EMPTY_REPORT_FILTERS: ReportFilterState = {
  projectId: "",
  siteId: "",
  from: "",
  to: "",
};

function valueOf(params: URLSearchParams, key: string): string {
  return (params.get(key) ?? "").trim();
}

export function parseReportFilters(params: URLSearchParams): ReportFilterState {
  return {
    projectId: valueOf(params, "projectId"),
    siteId: valueOf(params, "siteId"),
    from: valueOf(params, "from"),
    to: valueOf(params, "to"),
  };
}

export function buildReportFilterSearchParams(
  filters: ReportFilterState,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of ["projectId", "siteId", "from", "to"] as const) {
    const value = filters[key].trim();
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}

export function hasActiveReportFilters(filters: ReportFilterState): boolean {
  return Boolean(
    filters.projectId || filters.siteId || filters.from || filters.to,
  );
}

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Escapes a CSV cell and neutralises spreadsheet formula injection. Numeric
 * values are written as-is so counts are never text-mangled.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return String(value);
  }

  const neutralised = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;

  return `"${neutralised.replace(/"/g, '""')}"`;
}

function csvRow(cells: ReadonlyArray<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

function distributionEntries(values: Record<string, number>) {
  return Object.entries(values).filter(([, count]) => count > 0);
}

/**
 * Builds a self-describing CSV export of the visible report. Only aggregate
 * counts and labels are written; no underlying personal records are included.
 * Format: Section, Metric, Value (three-column format)
 */
export function buildReportCsv(report: HseReport): string {
  const rows: string[] = [];

  rows.push(csvRow(["IKOSH HSE report"]));
  rows.push(csvRow(["Generated at", report.generatedAt]));
  rows.push(csvRow(["Project", report.scope.projectId ?? "All accessible"]));
  rows.push(csvRow(["Site", report.scope.siteId ?? "All accessible"]));
  rows.push(csvRow(["From", report.scope.from ?? "No lower bound"]));
  rows.push(csvRow(["To", report.scope.to ?? "No upper bound"]));
  rows.push("");

  // Incidents and near misses
  rows.push(csvRow(["Incidents and near misses", "Total", report.incidents.total]));
  rows.push(csvRow(["Incidents and near misses", "Incidents", report.incidents.incidents]));
  rows.push(csvRow(["Incidents and near misses", "Near misses", report.incidents.nearMisses]));
  rows.push(csvRow(["Incidents and near misses", "Unclassified", report.incidents.unclassified]));
  for (const [status, count] of distributionEntries(report.incidents.byStatus)) {
    rows.push(csvRow(["Incidents and near misses", `Status: ${status}`, count]));
  }
  for (const category of report.incidents.byCategory) {
    rows.push(csvRow(["Incidents and near misses", `Category: ${category.category}`, category.count]));
  }
  rows.push("");

  // Inspections
  rows.push(csvRow(["Inspections", "Total", report.inspections.total]));
  rows.push(csvRow(["Inspections", "Findings", report.inspections.findingsTotal]));
  for (const [status, count] of distributionEntries(report.inspections.byStatus)) {
    rows.push(csvRow(["Inspections", `Status: ${status}`, count]));
  }
  for (const [severity, count] of distributionEntries(report.inspections.findingsBySeverity)) {
    rows.push(csvRow(["Inspections", `Finding severity: ${severity}`, count]));
  }
  rows.push("");

  // Audits
  rows.push(csvRow(["Audits", "Total", report.audits.total]));
  rows.push(csvRow(["Audits", "Findings", report.audits.findingsTotal]));
  for (const [status, count] of distributionEntries(report.audits.byStatus)) {
    rows.push(csvRow(["Audits", `Status: ${status}`, count]));
  }
  for (const [type, count] of distributionEntries(report.audits.byType)) {
    rows.push(csvRow(["Audits", `Type: ${type}`, count]));
  }
  for (const [severity, count] of distributionEntries(report.audits.findingsBySeverity)) {
    rows.push(csvRow(["Audits", `Finding severity: ${severity}`, count]));
  }
  for (const [result, count] of distributionEntries(report.audits.checklistByResult)) {
    rows.push(csvRow(["Audits", `Checklist result: ${result}`, count]));
  }
  rows.push("");

  // Permits to work
  rows.push(csvRow(["Permits to work", "Total", report.permits.total]));
  rows.push(csvRow(["Permits to work", "Expiring within 7 days", report.permits.expiringSoon]));
  for (const [status, count] of distributionEntries(report.permits.byStatus)) {
    rows.push(csvRow(["Permits to work", `Status: ${status}`, count]));
  }
  for (const workType of report.permits.byWorkType) {
    rows.push(csvRow(["Permits to work", `Work type: ${workType.workType}`, workType.count]));
  }
  rows.push("");

  // Corrective actions
  rows.push(csvRow(["Corrective actions", "Total", report.correctiveActions.total]));
  rows.push(csvRow(["Corrective actions", "Overdue", report.correctiveActions.overdue]));
  for (const [status, count] of distributionEntries(report.correctiveActions.byStatus)) {
    rows.push(csvRow(["Corrective actions", `Status: ${status}`, count]));
  }
  rows.push("");

  // Risk assessments
  rows.push(csvRow(["Risk assessments", "Total", report.riskAssessments.total]));
  rows.push(csvRow(["Risk assessments", "Hazards", report.riskAssessments.hazardsTotal]));
  rows.push(csvRow(["Risk assessments", "Reviews due", report.riskAssessments.reviewsDue]));
  for (const [status, count] of distributionEntries(report.riskAssessments.byStatus)) {
    rows.push(csvRow(["Risk assessments", `Status: ${status}`, count]));
  }
  for (const [level, count] of distributionEntries(report.riskAssessments.hazardsByResidualLevel)) {
    rows.push(csvRow(["Risk assessments", `Residual risk: ${level}`, count]));
  }
  rows.push("");

  // Training
  rows.push(csvRow(["Training", "Sessions", report.training.sessions]));
  for (const [status, count] of distributionEntries(report.training.byStatus)) {
    rows.push(csvRow(["Training", `Status: ${status}`, count]));
  }
  rows.push(csvRow(["Training", "Invited", report.training.attendance.invited]));
  rows.push(csvRow(["Training", "Attended", report.training.attendance.attended]));
  rows.push(csvRow(["Training", "Absent", report.training.attendance.absent]));
  rows.push(csvRow(["Training", "Completed", report.training.attendance.completed]));
  rows.push(csvRow(["Training", "Certificates issued", report.training.attendance.certificatesIssued]));
  rows.push(csvRow(["Training", "Employee attendees", report.training.attendance.employees]));
  rows.push(csvRow(["Training", "Contractor attendees", report.training.attendance.contractors]));
  rows.push("");

  // Toolbox talks
  rows.push(csvRow(["Toolbox talks", "Talks", report.toolboxTalks.talks]));
  for (const [status, count] of distributionEntries(report.toolboxTalks.byStatus)) {
    rows.push(csvRow(["Toolbox talks", `Status: ${status}`, count]));
  }
  rows.push(csvRow(["Toolbox talks", "Invited", report.toolboxTalks.attendance.invited]));
  rows.push(csvRow(["Toolbox talks", "Attended", report.toolboxTalks.attendance.attended]));
  rows.push(csvRow(["Toolbox talks", "Absent", report.toolboxTalks.attendance.absent]));
  rows.push(csvRow(["Toolbox talks", "Acknowledged", report.toolboxTalks.attendance.acknowledged]));
  rows.push(csvRow(["Toolbox talks", "Employee attendees", report.toolboxTalks.attendance.employees]));
  rows.push(csvRow(["Toolbox talks", "Contractor attendees", report.toolboxTalks.attendance.contractors]));

  return `${rows.join("\r\n")}\r\n`;
}