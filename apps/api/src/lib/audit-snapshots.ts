import type { ContractorDocument } from "../models/Contractor.js";
import type { ContractorPersonnelDocument } from "../models/ContractorPersonnel.js";
import type { ContractorPersonnelSiteAssignmentDocument } from "../models/ContractorPersonnelSiteAssignment.js";
import type { DepartmentDocument } from "../models/Department.js";
import type { AttachmentDocument } from "../models/Attachment.js";
import type { CorrectiveActionDocument } from "../models/CorrectiveAction.js";
import type { IncidentDocument } from "../models/Incident.js";
import type { ProjectDocument } from "../models/Project.js";
import type { SiteDocument } from "../models/Site.js";
import type { UserDocument } from "../models/User.js";

type WithId<T> = T & { _id: unknown };

function idOf(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }

  return String(value);
}

function dateOf(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/**
 * Audit snapshots intentionally whitelist business-relevant fields only.
 * Names, contact details and other unnecessary personal data are excluded.
 */
export function departmentAuditSnapshot(
  department: WithId<DepartmentDocument>,
): Record<string, unknown> {
  return {
    name: department.name,
    code: department.code,
    description: department.description ?? "",
    head: idOf(department.head),
    isActive: department.isActive,
  };
}

export function employeeAuditSnapshot(
  employee: WithId<UserDocument>,
): Record<string, unknown> {
  return {
    employeeId: employee.employeeId ?? null,
    department: idOf(employee.department),
    jobTitle: employee.jobTitle ?? null,
    employmentType: employee.employmentType ?? null,
    hireDate: dateOf(employee.hireDate),
    managerId: idOf(employee.managerId),
    ikoshRole: employee.ikoshRole,
    isActive: employee.isActive,
    assignedSites: (employee.assignedSites ?? [])
      .map((siteId) => idOf(siteId))
      .sort(),
  };
}

export function projectAuditSnapshot(
  project: WithId<ProjectDocument>,
): Record<string, unknown> {
  return {
    name: project.name,
    code: project.code,
    client: project.client ?? null,
    location: project.location ?? null,
    status: project.status,
    startDate: dateOf(project.startDate),
    endDate: dateOf(project.endDate),
  };
}

export function siteAuditSnapshot(
  site: WithId<SiteDocument>,
): Record<string, unknown> {
  return {
    project: idOf(site.project),
    name: site.name,
    code: site.code,
    location: site.location ?? null,
    description: site.description ?? "",
    status: site.status,
  };
}

export function contractorAuditSnapshot(
  contractor: WithId<ContractorDocument>,
): Record<string, unknown> {
  return {
    name: contractor.name,
    registrationNumber: contractor.registrationNumber ?? null,
    trade: contractor.trade ?? null,
    projects: (contractor.projects ?? []).map((projectId) => idOf(projectId)),
    isActive: contractor.isActive,
  };
}

export function contractorPersonnelAuditSnapshot(
  personnel: WithId<ContractorPersonnelDocument>,
): Record<string, unknown> {
  return {
    contractor: idOf(personnel.contractor),
    personnelId: personnel.personnelId ?? null,
    jobTitle: personnel.jobTitle ?? null,
    site: idOf(personnel.site),
    isActive: personnel.isActive,
  };
}

/**
 * Assignment snapshots capture the deployment relationship and both the
 * creation and ending responsibility trail. Legacy backfilled rows may have
 * null `assignedBy`/`endedBy`.
 */
export function contractorPersonnelSiteAssignmentAuditSnapshot(
  assignment: WithId<ContractorPersonnelSiteAssignmentDocument>,
): Record<string, unknown> {
  return {
    personnel: idOf(assignment.personnel),
    contractor: idOf(assignment.contractor),
    site: idOf(assignment.site),
    assignedAt: dateOf(assignment.assignedAt),
    assignedBy: idOf(assignment.assignedBy),
    endedAt: dateOf(assignment.endedAt),
    endedBy: idOf(assignment.endedBy),
    isActive: assignment.isActive,
  };
}

/**
 * Attachment metadata only. Filenames, descriptions and storage keys are
 * deliberately excluded: they may contain personal data or reveal internal
 * storage details.
 */
export function attachmentAuditSnapshot(
  attachment: WithId<AttachmentDocument>,
): Record<string, unknown> {
  return {
    mimeType: attachment.mimeType,
    size: attachment.size,
    checksum: attachment.checksum,
    entityType: attachment.entityType ?? null,
    entityId: idOf(attachment.entityId),
  };
}

/**
 * Incident snapshots capture workflow-relevant metadata only. Descriptions,
 * locations and other free-text report content are excluded to avoid
 * recording unnecessary personal data.
 */
export function incidentAuditSnapshot(
  incident: WithId<IncidentDocument>,
): Record<string, unknown> {
  return {
    site: idOf(incident.site),
    type: incident.type,
    occurredAt: dateOf(incident.occurredAt),
    category: incident.category ?? null,
    status: incident.status,
    classifiedBy: idOf(incident.classifiedBy),
    statusUpdatedBy: idOf(incident.statusUpdatedBy),
  };
}

/**
 * Corrective action snapshots record ownership and workflow metadata only.
 * Action descriptions and completion/verification notes are free text and are
 * deliberately excluded.
 */
export function correctiveActionAuditSnapshot(
  action: WithId<CorrectiveActionDocument>,
): Record<string, unknown> {
  return {
    source: action.source,
    incident: idOf(action.incident),
    project: idOf(action.project),
    site: idOf(action.site),
    assignedTo: idOf(action.assignedTo),
    dueDate: dateOf(action.dueDate),
    status: action.status,
    completedBy: idOf(action.completedBy),
    completedAt: dateOf(action.completedAt),
    verifiedBy: idOf(action.verifiedBy),
    verifiedAt: dateOf(action.verifiedAt),
  };
}
