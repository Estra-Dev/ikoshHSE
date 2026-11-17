import { isPermitTerminalStatus } from "../lib/hse-constants.js";

export interface PermitHazardLike {
  _id?: unknown;
  hazard: string;
  controlMeasures: string;
}

export interface PermitClosureChecksLike {
  workAreaSecured: boolean;
  personnelAccountedFor: boolean;
  equipmentIsolated: boolean;
  siteHandoverCompleted: boolean;
}

export interface PermitLike {
  _id: unknown;
  workDescription: string;
  workType: string;
  status: string;
  project: unknown;
  site: unknown;
  location?: string | null;
  validFrom: Date;
  validTo: Date;
  responsiblePerson: unknown;
  workersInvolved?: readonly string[];
  requiredPrecautions?: readonly string[];
  hazards?: readonly PermitHazardLike[];
  submittedBy?: unknown;
  submittedAt?: Date | null;
  approvedBy?: unknown;
  approvedAt?: Date | null;
  rejectedBy?: unknown;
  rejectedAt?: Date | null;
  activatedBy?: unknown;
  activatedAt?: Date | null;
  suspendedBy?: unknown;
  suspendedAt?: Date | null;
  resumedBy?: unknown;
  resumedAt?: Date | null;
  cancelledBy?: unknown;
  cancelledAt?: Date | null;
  closedBy?: unknown;
  closedAt?: Date | null;
  rejectionReason?: string | null;
  suspensionReason?: string | null;
  cancellationReason?: string | null;
  closureNotes?: string | null;
  closureChecks?: PermitClosureChecksLike | null;
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

export interface SerializedPermitHazard {
  id: string;
  hazard: string;
  controlMeasures: string;
}

export interface SerializedPermitClosureChecks {
  workAreaSecured: boolean;
  personnelAccountedFor: boolean;
  equipmentIsolated: boolean;
  siteHandoverCompleted: boolean;
}

export interface SerializedPermit {
  id: string;
  workDescription: string;
  workType: string;
  status: string;
  project: ProjectRef;
  site: SiteRef;
  location: string;
  validFrom: string;
  validTo: string;
  responsiblePerson: UserRef | null;
  workersInvolved: string[];
  requiredPrecautions: string[];
  hazards: SerializedPermitHazard[];
  submittedBy: UserRef | null;
  submittedAt: string | null;
  approvedBy: UserRef | null;
  approvedAt: string | null;
  rejectedBy: UserRef | null;
  rejectedAt: string | null;
  activatedBy: UserRef | null;
  activatedAt: string | null;
  suspendedBy: UserRef | null;
  suspendedAt: string | null;
  resumedBy: UserRef | null;
  resumedAt: string | null;
  cancelledBy: UserRef | null;
  cancelledAt: string | null;
  closedBy: UserRef | null;
  closedAt: string | null;
  rejectionReason: string | null;
  suspensionReason: string | null;
  cancellationReason: string | null;
  closureNotes: string | null;
  closureChecks: SerializedPermitClosureChecks | null;
  /** Server-derived at response time; terminal permits are not "expired". */
  isExpired: boolean;
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
  hazard: PermitHazardLike,
  index: number,
): SerializedPermitHazard {
  return {
    id: hazard._id ? String(hazard._id) : `hazard-${index}`,
    hazard: hazard.hazard,
    controlMeasures: hazard.controlMeasures,
  };
}

/**
 * Whitelists permit response fields and flattens populated references into
 * display-safe objects. `isExpired` is derived at response time so the client
 * never has to guess whether a permit's validity window has elapsed.
 */
export function toPermitSummary(permit: PermitLike): SerializedPermit {
  const project = asDocument(permit.project);
  const site = asDocument(permit.site);
  const now = Date.now();
  const validTo = permit.validTo instanceof Date ? permit.validTo.getTime() : NaN;

  return {
    id: String(permit._id),
    workDescription: permit.workDescription,
    workType: permit.workType,
    status: permit.status,
    project: {
      id: project ? String(project._id) : "",
      name: project?.name ?? null,
    },
    site: {
      id: site ? String(site._id) : "",
      name: site?.name ?? null,
      code: site?.code ?? null,
    },
    location: permit.location ?? "",
    validFrom: permit.validFrom.toISOString(),
    validTo: permit.validTo.toISOString(),
    responsiblePerson: userRef(permit.responsiblePerson),
    workersInvolved: [...(permit.workersInvolved ?? [])],
    requiredPrecautions: [...(permit.requiredPrecautions ?? [])],
    hazards: (permit.hazards ?? []).map(hazardRef),
    submittedBy: userRef(permit.submittedBy),
    submittedAt: dateOf(permit.submittedAt),
    approvedBy: userRef(permit.approvedBy),
    approvedAt: dateOf(permit.approvedAt),
    rejectedBy: userRef(permit.rejectedBy),
    rejectedAt: dateOf(permit.rejectedAt),
    activatedBy: userRef(permit.activatedBy),
    activatedAt: dateOf(permit.activatedAt),
    suspendedBy: userRef(permit.suspendedBy),
    suspendedAt: dateOf(permit.suspendedAt),
    resumedBy: userRef(permit.resumedBy),
    resumedAt: dateOf(permit.resumedAt),
    cancelledBy: userRef(permit.cancelledBy),
    cancelledAt: dateOf(permit.cancelledAt),
    closedBy: userRef(permit.closedBy),
    closedAt: dateOf(permit.closedAt),
    rejectionReason: permit.rejectionReason ?? null,
    suspensionReason: permit.suspensionReason ?? null,
    cancellationReason: permit.cancellationReason ?? null,
    closureNotes: permit.closureNotes ?? null,
    closureChecks: permit.closureChecks
      ? {
          workAreaSecured: permit.closureChecks.workAreaSecured,
          personnelAccountedFor: permit.closureChecks.personnelAccountedFor,
          equipmentIsolated: permit.closureChecks.equipmentIsolated,
          siteHandoverCompleted: permit.closureChecks.siteHandoverCompleted,
        }
      : null,
    isExpired:
      Number.isFinite(validTo) &&
      validTo < now &&
      !isPermitTerminalStatus(permit.status),
    createdBy: userRef(permit.createdBy),
    createdAt: permit.createdAt.toISOString(),
    updatedAt: permit.updatedAt.toISOString(),
  };
}
