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
  };
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
    reviewDate: dateOf(assessment.reviewDate),
    hazards: (assessment.hazards ?? []).map(hazardRef),
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
