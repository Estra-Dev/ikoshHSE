export interface RiskHazardLike {
  _id?: unknown;
  hazard: string;
  consequences?: string | null;
  existingControls?: string | null;
  likelihood: number;
  severity: number;
  inherentLevel: string;
  residualLikelihood: number;
  residualSeverity: number;
  residualLevel: string;
  additionalControls?: string | null;
  taskStepId?: unknown;
}

export interface RiskTaskStepLike {
  _id?: unknown;
  sequence: number;
  description: string;
}

export interface RiskAssessmentLike {
  _id: unknown;
  title: string;
  description?: string | null;
  status: string;
  project: unknown;
  site?: unknown;
  owner: unknown;
  reviewDate?: Date | null;
  hazards?: readonly RiskHazardLike[];
  taskSteps?: readonly RiskTaskStepLike[];
  revision?: number | null;
  lineageId?: unknown;
  supersedes?: unknown;
  supersededBy?: unknown;
  supersededAt?: Date | null;
  reviewTrigger?: string | null;
  reviewTriggerIncident?: unknown;
  submittedBy?: unknown;
  submittedAt?: Date | null;
  approvedBy?: unknown;
  approvedAt?: Date | null;
  archivedBy?: unknown;
  archivedAt?: Date | null;
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

export interface SerializedRiskHazard {
  id: string;
  hazard: string;
  consequences: string;
  existingControls: string;
  likelihood: number;
  severity: number;
  inherentLevel: string;
  residualLikelihood: number;
  residualSeverity: number;
  residualLevel: string;
  additionalControls: string;
  taskStepId: string | null;
}

export interface SerializedRiskTaskStep {
  id: string;
  sequence: number;
  description: string;
}

export interface IncidentRef {
  id: string;
  type: string | null;
  title: string | null;
}

export interface SerializedRiskAssessment {
  id: string;
  title: string;
  description: string;
  status: string;
  project: ProjectRef;
  site: SiteRef | null;
  owner: UserRef | null;
  reviewDate: string | null;
  hazards: SerializedRiskHazard[];
  taskSteps: SerializedRiskTaskStep[];
  revision: number;
  lineageId: string | null;
  supersedes: string | null;
  supersededBy: string | null;
  supersededAt: string | null;
  reviewTrigger: string | null;
  reviewTriggerIncident: IncidentRef | null;
  isCurrent: boolean;
  isSuperseded: boolean;
  isReviewDue: boolean;
  submittedBy: UserRef | null;
  submittedAt: string | null;
  approvedBy: UserRef | null;
  approvedAt: string | null;
  archivedBy: UserRef | null;
  archivedAt: string | null;
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

function hazardRef(
  hazard: RiskHazardLike,
  index: number,
): SerializedRiskHazard {
  return {
    id: hazard._id ? String(hazard._id) : `hazard-${index}`,
    hazard: hazard.hazard,
    consequences: hazard.consequences ?? "",
    existingControls: hazard.existingControls ?? "",
    likelihood: hazard.likelihood,
    severity: hazard.severity,
    inherentLevel: hazard.inherentLevel,
    residualLikelihood: hazard.residualLikelihood,
    residualSeverity: hazard.residualSeverity,
    residualLevel: hazard.residualLevel,
    additionalControls: hazard.additionalControls ?? "",
    taskStepId: hazard.taskStepId ? String(hazard.taskStepId) : null,
  };
}

function stepRef(
  step: RiskTaskStepLike,
  index: number,
): SerializedRiskTaskStep {
  return {
    id: step._id ? String(step._id) : `task-step-${index}`,
    sequence: step.sequence,
    description: step.description,
  };
}

function referenceId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const document = asDocument(value);
  return document ? String(document._id) : null;
}

/**
 * Whitelists risk assessment response fields and flattens populated references
 * into display-safe objects. Derived levels are returned so the client never
 * has to recompute (and cannot disagree with) the stored risk band.
 */
export function toRiskAssessmentSummary(
  assessment: RiskAssessmentLike,
): SerializedRiskAssessment {
  const project = asDocument(assessment.project);
  const site = asDocument(assessment.site);
  const incident = asDocument(assessment.reviewTriggerIncident);
  const taskSteps = [...(assessment.taskSteps ?? [])].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const supersededBy = referenceId(assessment.supersededBy);
  const reviewDate = assessment.reviewDate ?? null;

  return {
    id: String(assessment._id),
    title: assessment.title,
    description: assessment.description ?? "",
    status: assessment.status,
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
    owner: userRef(assessment.owner),
    reviewDate: dateOf(reviewDate),
    hazards: (assessment.hazards ?? []).map(hazardRef),
    taskSteps: taskSteps.map(stepRef),
    revision: assessment.revision ?? 1,
    lineageId: referenceId(assessment.lineageId),
    supersedes: referenceId(assessment.supersedes),
    supersededBy,
    supersededAt: dateOf(assessment.supersededAt),
    reviewTrigger: assessment.reviewTrigger ?? null,
    reviewTriggerIncident: incident
      ? {
          id: String(incident._id),
          type: incident.type ?? null,
          title: incident.title ?? null,
        }
      : null,
    isCurrent:
      assessment.status === "APPROVED" && supersededBy === null,
    isSuperseded: supersededBy !== null,
    isReviewDue:
      reviewDate instanceof Date && reviewDate.getTime() <= Date.now(),
    submittedBy: userRef(assessment.submittedBy),
    submittedAt: dateOf(assessment.submittedAt),
    approvedBy: userRef(assessment.approvedBy),
    approvedAt: dateOf(assessment.approvedAt),
    archivedBy: userRef(assessment.archivedBy),
    archivedAt: dateOf(assessment.archivedAt),
    createdBy: userRef(assessment.createdBy),
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString(),
  };
}
