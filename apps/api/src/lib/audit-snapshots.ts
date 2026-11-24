import type { ContractorDocument } from "../models/Contractor.js";
import type { ContractorPersonnelDocument } from "../models/ContractorPersonnel.js";
import type { ContractorPersonnelSiteAssignmentDocument } from "../models/ContractorPersonnelSiteAssignment.js";
import type { DepartmentDocument } from "../models/Department.js";
import type { AttachmentDocument } from "../models/Attachment.js";
import type { CorrectiveActionDocument } from "../models/CorrectiveAction.js";
import type { IncidentDocument } from "../models/Incident.js";
import type { InspectionDocument } from "../models/Inspection.js";
import type { HseAuditDocument } from "../models/HseAudit.js";
import type { PermitDocument } from "../models/Permit.js";
import type { PpeIssuanceDocument } from "../models/PpeIssuance.js";
import type { PpeItemDocument } from "../models/PpeItem.js";
import type { PpeStockDocument } from "../models/PpeStock.js";
import type { ProjectDocument } from "../models/Project.js";
import type { RiskAssessmentDocument } from "../models/RiskAssessment.js";
import type { SiteDocument } from "../models/Site.js";
import type { TrainingCourseDocument } from "../models/TrainingCourse.js";
import type { TrainingSessionDocument } from "../models/TrainingSession.js";
import type { ToolboxTalkDocument } from "../models/ToolboxTalk.js";
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
    inspection: idOf(action.inspection),
    findingId: action.findingId ? String(action.findingId) : null,
    riskAssessment: idOf(action.riskAssessment),
    riskAssessmentHazardId: action.riskAssessmentHazardId
      ? String(action.riskAssessmentHazardId)
      : null,
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

/**
 * Inspection snapshots record schedule, ownership and workflow metadata only.
 * Titles, descriptions, recommendations and completion notes are free text and
 * are deliberately excluded.
 */
export function inspectionAuditSnapshot(
  inspection: WithId<InspectionDocument>,
): Record<string, unknown> {
  const findings = inspection.findings ?? [];

  return {
    project: idOf(inspection.project),
    site: idOf(inspection.site),
    inspector: idOf(inspection.inspector),
    type: inspection.type,
    status: inspection.status,
    scheduledFor: dateOf(inspection.scheduledFor),
    completedAt: dateOf(inspection.completedAt),
    completedBy: idOf(inspection.completedBy),
    findingCount: findings.length,
    linkedCorrectiveActionCount: findings.filter(
      (finding) => finding.correctiveAction,
    ).length,
  };
}

/**
 * HSE audit snapshots record schedule, auditor ownership and workflow metadata
 * only. Titles, descriptions, checklist text/notes, findings and completion
 * notes are free text and are deliberately excluded.
 */
export function hseAuditAuditSnapshot(
  audit: WithId<HseAuditDocument>,
): Record<string, unknown> {
  const findings = audit.findings ?? [];
  const checklist = audit.checklist ?? [];

  return {
    project: idOf(audit.project),
    site: idOf(audit.site),
    auditors: (audit.auditors ?? []).map((auditor) => idOf(auditor)),
    type: audit.type,
    status: audit.status,
    scheduledFor: dateOf(audit.scheduledFor),
    completedAt: dateOf(audit.completedAt),
    completedBy: idOf(audit.completedBy),
    checklistCount: checklist.length,
    assessedChecklistCount: checklist.filter(
      (item) => item.result !== "PENDING",
    ).length,
    findingCount: findings.length,
    linkedCorrectiveActionCount: findings.filter(
      (finding) => finding.correctiveAction,
    ).length,
  };
}

const RISK_LEVEL_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function highestRiskLevel(levels: readonly string[]): string | null {
  if (levels.length === 0) {
    return null;
  }

  return levels.reduce((highest, level) =>
    (RISK_LEVEL_RANK[level] ?? -1) > (RISK_LEVEL_RANK[highest] ?? -1)
      ? level
      : highest,
  );
}

/**
 * Risk assessment snapshots record workflow and matrix metadata only. Titles,
 * descriptions, hazard text and control text are free text and are
 * deliberately excluded.
 */
export function riskAssessmentAuditSnapshot(
  assessment: WithId<RiskAssessmentDocument>,
): Record<string, unknown> {
  const hazards = assessment.hazards ?? [];
  const taskSteps = assessment.taskSteps ?? [];

  return {
    project: idOf(assessment.project),
    site: idOf(assessment.site),
    owner: idOf(assessment.owner),
    status: assessment.status,
    revision: assessment.revision ?? 1,
    lineageId: idOf(assessment.lineageId),
    supersedes: idOf(assessment.supersedes),
    supersededBy: idOf(assessment.supersededBy),
    supersededAt: dateOf(assessment.supersededAt),
    reviewTrigger: assessment.reviewTrigger ?? null,
    reviewTriggerIncident: idOf(assessment.reviewTriggerIncident),
    reviewDate: dateOf(assessment.reviewDate),
    hazardCount: hazards.length,
    taskStepCount: taskSteps.length,
    generalHazardCount: hazards.filter((hazard) => !hazard.taskStepId).length,
    taskStepHazardCounts: taskSteps.map((step) => ({
      taskStepId: String(step._id),
      hazardCount: hazards.filter(
        (hazard) =>
          hazard.taskStepId !== null &&
          hazard.taskStepId !== undefined &&
          String(hazard.taskStepId) === String(step._id),
      ).length,
    })),
    highestInherentLevel: highestRiskLevel(
      hazards.map((hazard) => hazard.inherentLevel),
    ),
    highestResidualLevel: highestRiskLevel(
      hazards.map((hazard) => hazard.residualLevel),
    ),
    submittedBy: idOf(assessment.submittedBy),
    submittedAt: dateOf(assessment.submittedAt),
    approvedBy: idOf(assessment.approvedBy),
    approvedAt: dateOf(assessment.approvedAt),
    archivedBy: idOf(assessment.archivedBy),
    archivedAt: dateOf(assessment.archivedAt),
  };
}

/**
 * Permit snapshots record scope, validity and workflow metadata only. Work
 * descriptions, locations, hazard/control text, worker names and the reasons
 * and notes attached to workflow actions are free text and are deliberately
 * excluded.
 */
export function permitAuditSnapshot(
  permit: WithId<PermitDocument>,
): Record<string, unknown> {
  const closureChecks = permit.closureChecks ?? null;

  return {
    project: idOf(permit.project),
    site: idOf(permit.site),
    workType: permit.workType,
    status: permit.status,
    policyVersion: permit.policyVersion ?? null,
    linkedRiskAssessmentIds: (permit.riskAssessments ?? []).map((ref) =>
      idOf(ref),
    ),
    validFrom: dateOf(permit.validFrom),
    validTo: dateOf(permit.validTo),
    responsiblePerson: idOf(permit.responsiblePerson),
    workerCount: (permit.workersInvolved ?? []).length,
    precautionCount: (permit.requiredPrecautions ?? []).length,
    hazardCount: (permit.hazards ?? []).length,
    submittedBy: idOf(permit.submittedBy),
    submittedAt: dateOf(permit.submittedAt),
    approvedBy: idOf(permit.approvedBy),
    approvedAt: dateOf(permit.approvedAt),
    rejectedBy: idOf(permit.rejectedBy),
    rejectedAt: dateOf(permit.rejectedAt),
    activatedBy: idOf(permit.activatedBy),
    activatedAt: dateOf(permit.activatedAt),
    suspendedBy: idOf(permit.suspendedBy),
    suspendedAt: dateOf(permit.suspendedAt),
    resumedBy: idOf(permit.resumedBy),
    resumedAt: dateOf(permit.resumedAt),
    cancelledBy: idOf(permit.cancelledBy),
    cancelledAt: dateOf(permit.cancelledAt),
    closedBy: idOf(permit.closedBy),
    closedAt: dateOf(permit.closedAt),
    closureChecks: closureChecks
      ? {
          workAreaSecured: closureChecks.workAreaSecured,
          personnelAccountedFor: closureChecks.personnelAccountedFor,
          equipmentIsolated: closureChecks.equipmentIsolated,
          siteHandoverCompleted: closureChecks.siteHandoverCompleted,
        }
      : null,
  };
}

interface PermitOperationalRecordAuditLike {
  _id?: unknown;
  type?: string | null;
  attachmentIds?: readonly unknown[] | null;
}

interface PermitOperationalRecordAuditContext {
  permitId: unknown;
  project: unknown;
  site: unknown;
}

/**
 * Whitelisted snapshot for one appended permit operational record. Notes,
 * filenames, storage keys and raw attachment data are deliberately excluded.
 */
export function permitOperationalRecordAuditSnapshot(
  record: PermitOperationalRecordAuditLike,
  context: PermitOperationalRecordAuditContext,
): Record<string, unknown> {
  return {
    recordId: idOf(record._id),
    permitId: idOf(context.permitId),
    projectId: idOf(context.project),
    siteId: idOf(context.site),
    type: record.type ?? null,
    attachmentCount: (record.attachmentIds ?? []).length,
  };
}

interface ReadinessLinksAuditLike {
  inspectionIds?: readonly unknown[];
  ppeIssuanceIds?: readonly unknown[];
  correctiveActionIds?: readonly unknown[];
  contractorIds?: readonly unknown[];
  toolboxTalkId?: unknown;
}

interface ReadinessWorksiteVerificationAuditLike {
  verifiedBy?: unknown;
  verifiedAt?: unknown;
  attachmentIds?: readonly unknown[];
}

interface ReadinessAttestationAuditLike {
  requirementId?: string | null;
  state?: string | null;
  recordedBy?: unknown;
  recordedAt?: unknown;
  attachmentIds?: readonly unknown[];
}

interface PermitReadinessAuditLike {
  personnel?: readonly unknown[];
  equipment?: readonly unknown[];
  isolations?: readonly unknown[];
  gasTests?: readonly unknown[];
  links?: ReadinessLinksAuditLike | null;
  worksiteVerification?: ReadinessWorksiteVerificationAuditLike | null;
  worksiteVerificationHistory?: readonly ReadinessWorksiteVerificationAuditLike[];
  attestations?: readonly ReadinessAttestationAuditLike[];
}

function readinessLinksAuditSnapshot(
  links: ReadinessLinksAuditLike | null | undefined,
): Record<string, unknown> | null {
  if (!links) {
    return null;
  }

  return {
    inspectionIds: (links.inspectionIds ?? []).map(idOf),
    ppeIssuanceIds: (links.ppeIssuanceIds ?? []).map(idOf),
    correctiveActionIds: (links.correctiveActionIds ?? []).map(idOf),
    contractorIds: (links.contractorIds ?? []).map(idOf),
    toolboxTalkId: idOf(links.toolboxTalkId),
  };
}

function worksiteVerificationAuditSnapshot(
  verification: ReadinessWorksiteVerificationAuditLike | null | undefined,
): Record<string, unknown> | null {
  if (!verification) {
    return null;
  }

  return {
    verifiedBy: idOf(verification.verifiedBy),
    verifiedAt: dateOf(verification.verifiedAt),
    attachmentIds: (verification.attachmentIds ?? []).map(idOf),
  };
}

/**
 * Permit readiness snapshot. It records identifiers, counts and declaration
 * states only. Notes, names, isolation descriptions and gas readings are
 * deliberately excluded because they are free text or sensitive measurements.
 */
export function permitReadinessAuditSnapshot(
  readiness: PermitReadinessAuditLike | null | undefined,
): Record<string, unknown> {
  if (!readiness) {
    return {
      personnelCount: 0,
      equipmentCount: 0,
      isolationCount: 0,
      gasTestCount: 0,
      links: null,
      worksiteVerification: null,
      worksiteVerificationHistoryCount: 0,
      attestationCount: 0,
      attestations: [],
    };
  }

  return {
    personnelCount: (readiness.personnel ?? []).length,
    equipmentCount: (readiness.equipment ?? []).length,
    isolationCount: (readiness.isolations ?? []).length,
    gasTestCount: (readiness.gasTests ?? []).length,
    links: readinessLinksAuditSnapshot(readiness.links),
    worksiteVerification: worksiteVerificationAuditSnapshot(
      readiness.worksiteVerification,
    ),
    worksiteVerificationHistoryCount: (
      readiness.worksiteVerificationHistory ?? []
    ).length,
    attestationCount: (readiness.attestations ?? []).length,
    attestations: (readiness.attestations ?? []).map((attestation) => ({
      requirementId: attestation.requirementId ?? null,
      state: attestation.state ?? null,
      recordedBy: idOf(attestation.recordedBy),
      recordedAt: dateOf(attestation.recordedAt),
      attachmentIds: (attestation.attachmentIds ?? []).map(idOf),
    })),
  };
}

/**
 * Training course snapshots record catalogue metadata only. Titles and
 * descriptions are free text and are deliberately excluded.
 */
export function trainingCourseAuditSnapshot(
  course: WithId<TrainingCourseDocument>,
): Record<string, unknown> {
  return {
    code: course.code,
    category: course.category,
    defaultDurationMinutes: course.defaultDurationMinutes ?? null,
    isActive: course.isActive,
  };
}

/**
 * Training session snapshots record scope, schedule, workflow actors and
 * participant counts. Topics, descriptions, trainer names, participant names
 * and certificate numbers are free text or personal data and are excluded.
 */
export function trainingSessionAuditSnapshot(
  session: WithId<TrainingSessionDocument>,
): Record<string, unknown> {
  const participants = session.participants ?? [];

  return {
    course: idOf(session.course),
    project: idOf(session.project),
    site: idOf(session.site),
    status: session.status,
    scheduledDate: dateOf(session.scheduledDate),
    durationMinutes: session.durationMinutes,
    participantCount: participants.length,
    employeeParticipantCount: participants.filter(
      (participant) => participant.kind === "EMPLOYEE",
    ).length,
    contractorParticipantCount: participants.filter(
      (participant) => participant.kind === "CONTRACTOR",
    ).length,
    attendedCount: participants.filter(
      (participant) => participant.attendance === "ATTENDED",
    ).length,
    completedCount: participants.filter(
      (participant) => participant.completed,
    ).length,
    certificateCount: participants.filter(
      (participant) => Boolean(participant.certificateNumber),
    ).length,
    completedBy: idOf(session.completedBy),
    completedAt: dateOf(session.completedAt),
    cancelledBy: idOf(session.cancelledBy),
    cancelledAt: dateOf(session.cancelledAt),
    createdBy: idOf(session.createdBy),
  };
}

/**
 * Toolbox talk snapshots record scope, schedule, workflow actors and
 * participant counts. Topics, discussion points, facilitator names,
 * participant names and notes are excluded.
 */
export function toolboxTalkAuditSnapshot(
  talk: WithId<ToolboxTalkDocument>,
): Record<string, unknown> {
  const participants = talk.participants ?? [];

  return {
    project: idOf(talk.project),
    site: idOf(talk.site),
    status: talk.status,
    scheduledDate: dateOf(talk.scheduledDate),
    durationMinutes: talk.durationMinutes,
    participantCount: participants.length,
    employeeParticipantCount: participants.filter(
      (participant) => participant.kind === "EMPLOYEE",
    ).length,
    contractorParticipantCount: participants.filter(
      (participant) => participant.kind === "CONTRACTOR",
    ).length,
    attendedCount: participants.filter(
      (participant) => participant.attendance === "ATTENDED",
    ).length,
    acknowledgedCount: participants.filter(
      (participant) => participant.acknowledged,
    ).length,
    completedBy: idOf(talk.completedBy),
    completedAt: dateOf(talk.completedAt),
    cancelledBy: idOf(talk.cancelledBy),
    cancelledAt: dateOf(talk.cancelledAt),
    createdBy: idOf(talk.createdBy),
  };
}

/** PPE catalogue snapshots exclude free-text descriptions. */
export function ppeItemAuditSnapshot(
  item: WithId<PpeItemDocument>,
): Record<string, unknown> {
  return {
    code: item.code,
    name: item.name,
    category: item.category,
    size: item.size ?? null,
    unit: item.unit,
    isActive: item.isActive,
  };
}

/** Stock snapshots capture quantities and the recorded adjustment reason. */
export function ppeStockAuditSnapshot(
  stock: WithId<PpeStockDocument>,
  reason?: string | null,
): Record<string, unknown> {
  return {
    project: idOf(stock.project),
    site: idOf(stock.site),
    item: idOf(stock.item),
    quantityOnHand: stock.quantityOnHand,
    minimumQuantity: stock.minimumQuantity,
    updatedBy: idOf(stock.updatedBy),
    ...(reason ? { reason } : {}),
  };
}

/**
 * Issuance snapshots record the workforce reference kind and ids, item,
 * quantity and lifecycle state. Recipient names and notes are excluded.
 */
export function ppeIssuanceAuditSnapshot(
  issuance: WithId<PpeIssuanceDocument>,
  reason?: string | null,
): Record<string, unknown> {
  return {
    project: idOf(issuance.project),
    site: idOf(issuance.site),
    item: idOf(issuance.item),
    kind: issuance.kind,
    employee: idOf(issuance.employee),
    contractorPersonnel: idOf(issuance.contractorPersonnel),
    contractor: idOf(issuance.contractor),
    quantity: issuance.quantity,
    conditionAtIssue: issuance.conditionAtIssue,
    status: issuance.status,
    issuedOn: dateOf(issuance.issuedOn),
    issuedBy: idOf(issuance.issuedBy),
    returnedOn: dateOf(issuance.returnedOn),
    returnedBy: idOf(issuance.returnedBy),
    returnCondition: issuance.returnCondition ?? null,
    restocked: issuance.restocked,
    lostOn: dateOf(issuance.lostOn),
    lostBy: idOf(issuance.lostBy),
    replacementFor: idOf(issuance.replacementFor),
    ...(reason ? { reason } : {}),
  };
}
