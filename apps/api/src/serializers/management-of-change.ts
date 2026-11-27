export interface ManagementOfChangeUserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ManagementOfChangeReference {
  id: string;
  name: string | null;
  code: string | null;
}

export interface ManagementOfChangeRiskAssessmentRef {
  id: string;
  title: string;
  status: string;
  revision: number | null;
}

export interface ManagementOfChangeApprovalLike {
  approvalType?: string | null;
  approver?: unknown;
  authorityBasis?: string | null;
  decision?: string | null;
  comments?: string | null;
  decidedAt?: Date | string | null;
}

export interface ManagementOfChangeLike {
  _id: unknown;
  reference: string;
  title: string;
  reason: string;
  scope: string;
  changeType: string;
  plannedStartAt?: Date | string | null;
  plannedEndAt?: Date | string | null;
  affectedAssets?: readonly string[] | null;
  affectedPeople?: readonly string[] | null;
  project?: unknown;
  site?: unknown;
  changeOwner?: unknown;
  submittedBy?: unknown;
  submittedAt?: Date | string | null;
  status: string;
  impactAssessment?: {
    qhseRisks?: string | null;
    environmentalAspects?: string | null;
    legalAndClientObligations?: string | null;
    competenceRequirements?: string | null;
    procedureChanges?: string | null;
    emergencyArrangements?: string | null;
    interfaces?: string | null;
    riskAssessment?: unknown;
  } | null;
  implementationPlan?: {
    controls?: string | null;
    testingPlan?: string | null;
    communicationPlan?: string | null;
    rollbackPlan?: string | null;
    updatedDocuments?: readonly string[] | null;
    briefingCompleted?: boolean | null;
    briefingAt?: Date | string | null;
  } | null;
  approvals?: readonly ManagementOfChangeApprovalLike[] | null;
  verification?: {
    findings?: string | null;
    testingCompleted?: boolean | null;
    inspectionCompleted?: boolean | null;
    actionsClosed?: boolean | null;
    verifiedBy?: unknown;
    verifiedAt?: Date | string | null;
  } | null;
  emergencyChange?: boolean | null;
  emergencyReviewAt?: Date | string | null;
  closedBy?: unknown;
  closedAt?: Date | string | null;
  createdBy?: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SerializedManagementOfChange {
  id: string;
  reference: string;
  title: string;
  reason: string;
  scope: string;
  changeType: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  affectedAssets: string[];
  affectedPeople: string[];
  project: ManagementOfChangeReference | null;
  site: ManagementOfChangeReference | null;
  changeOwner: ManagementOfChangeUserRef | null;
  submittedBy: ManagementOfChangeUserRef | null;
  submittedAt: string | null;
  status: string;
  impactAssessment: {
    qhseRisks: string;
    environmentalAspects: string;
    legalAndClientObligations: string;
    competenceRequirements: string;
    procedureChanges: string;
    emergencyArrangements: string;
    interfaces: string;
    riskAssessment: ManagementOfChangeRiskAssessmentRef | null;
  };
  implementationPlan: {
    controls: string;
    testingPlan: string;
    communicationPlan: string;
    rollbackPlan: string;
    updatedDocuments: string[];
    briefingCompleted: boolean;
    briefingAt: string | null;
  };
  approvals: Array<{
    approvalType: string;
    approver: ManagementOfChangeUserRef | null;
    authorityBasis: string;
    decision: string;
    comments: string;
    decidedAt: string | null;
  }>;
  verification: {
    findings: string;
    testingCompleted: boolean;
    inspectionCompleted: boolean;
    actionsClosed: boolean;
    verifiedBy: ManagementOfChangeUserRef | null;
    verifiedAt: string | null;
  };
  emergencyChange: boolean;
  emergencyReviewAt: string | null;
  closedBy: ManagementOfChangeUserRef | null;
  closedAt: string | null;
  createdBy: ManagementOfChangeUserRef | null;
  createdAt: string;
  updatedAt: string;
}

interface RefDocument {
  _id: unknown;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  name?: string | null;
  code?: string | null;
  title?: string | null;
  status?: string | null;
  revision?: number | null;
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
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value !== "") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function userRef(value: unknown): ManagementOfChangeUserRef | null {
  const document = asDocument(value);

  if (!document) {
    return null;
  }

  return {
    id: String(document._id),
    firstName: document.firstName ?? "",
    lastName: document.lastName ?? "",
    email: document.email ?? "",
  };
}

function referenceRef(
  value: unknown,
): ManagementOfChangeReference | null {
  const document = asDocument(value);

  if (!document) {
    return null;
  }

  return {
    id: String(document._id),
    name: document.name ?? null,
    code: document.code ?? null,
  };
}

function riskAssessmentRef(
  value: unknown,
): ManagementOfChangeRiskAssessmentRef | null {
  const document = asDocument(value);

  if (!document) {
    return null;
  }

  return {
    id: String(document._id),
    title: document.title ?? "",
    status: document.status ?? "",
    revision: document.revision ?? null,
  };
}

/**
 * Whitelists Management of Change response fields and converts MongoDB
 * identifiers to the stable `id` used by the web client. Every populated or
 * raw reference is normalised so navigation never receives an `_id`-only
 * object.
 */
export function toManagementOfChangeSummary(
  change: ManagementOfChangeLike,
): SerializedManagementOfChange {
  const assessment = change.impactAssessment ?? {};
  const implementation = change.implementationPlan ?? {};
  const verification = change.verification ?? {};

  return {
    id: String(change._id),
    reference: change.reference,
    title: change.title,
    reason: change.reason,
    scope: change.scope,
    changeType: change.changeType,
    plannedStartAt: dateOf(change.plannedStartAt),
    plannedEndAt: dateOf(change.plannedEndAt),
    affectedAssets: [...(change.affectedAssets ?? [])],
    affectedPeople: [...(change.affectedPeople ?? [])],
    project: referenceRef(change.project),
    site: referenceRef(change.site),
    changeOwner: userRef(change.changeOwner),
    submittedBy: userRef(change.submittedBy),
    submittedAt: dateOf(change.submittedAt),
    status: change.status,
    impactAssessment: {
      qhseRisks: assessment.qhseRisks ?? "",
      environmentalAspects: assessment.environmentalAspects ?? "",
      legalAndClientObligations: assessment.legalAndClientObligations ?? "",
      competenceRequirements: assessment.competenceRequirements ?? "",
      procedureChanges: assessment.procedureChanges ?? "",
      emergencyArrangements: assessment.emergencyArrangements ?? "",
      interfaces: assessment.interfaces ?? "",
      riskAssessment: riskAssessmentRef(assessment.riskAssessment),
    },
    implementationPlan: {
      controls: implementation.controls ?? "",
      testingPlan: implementation.testingPlan ?? "",
      communicationPlan: implementation.communicationPlan ?? "",
      rollbackPlan: implementation.rollbackPlan ?? "",
      updatedDocuments: [...(implementation.updatedDocuments ?? [])],
      briefingCompleted: implementation.briefingCompleted ?? false,
      briefingAt: dateOf(implementation.briefingAt),
    },
    approvals: (change.approvals ?? []).map((approval) => ({
      approvalType: approval.approvalType ?? "",
      approver: userRef(approval.approver),
      authorityBasis: approval.authorityBasis ?? "",
      decision: approval.decision ?? "",
      comments: approval.comments ?? "",
      decidedAt: dateOf(approval.decidedAt),
    })),
    verification: {
      findings: verification.findings ?? "",
      testingCompleted: verification.testingCompleted ?? false,
      inspectionCompleted: verification.inspectionCompleted ?? false,
      actionsClosed: verification.actionsClosed ?? false,
      verifiedBy: userRef(verification.verifiedBy),
      verifiedAt: dateOf(verification.verifiedAt),
    },
    emergencyChange: change.emergencyChange ?? false,
    emergencyReviewAt: dateOf(change.emergencyReviewAt),
    closedBy: userRef(change.closedBy),
    closedAt: dateOf(change.closedAt),
    createdBy: userRef(change.createdBy),
    createdAt: dateOf(change.createdAt) ?? new Date(0).toISOString(),
    updatedAt: dateOf(change.updatedAt) ?? new Date(0).toISOString(),
  };
}
