export interface ContractorPersonnelLike {
  _id: unknown;
  contractor: unknown;
  firstName: string;
  lastName: string;
  personnelId?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  site?: unknown | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractorPersonnelSiteRef {
  id: string;
  name: string | null;
}

export interface SerializedContractorPersonnel {
  id: string;
  contractor: { id: string };
  firstName: string;
  lastName: string;
  personnelId: string | null;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  /** Legacy single-site reference, kept until the backfill is verified. */
  site: { id: string } | null;
  /** Sites the person is assigned to via active assignment records. */
  activeSites: ContractorPersonnelSiteRef[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractorPersonnelSummaryOptions {
  activeSites?: readonly ContractorPersonnelSiteRef[];
}

export interface ContractorPersonnelSiteAssignmentLike {
  _id: unknown;
  personnel: unknown;
  contractor: unknown;
  site: unknown;
  assignedAt: Date;
  assignedBy?: unknown | null;
  endedAt?: Date | null;
  endedBy?: unknown | null;
  isActive: boolean;
}

export interface SerializedAssignmentUser {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SerializedContractorPersonnelSiteAssignment {
  id: string;
  personnel: { id: string };
  contractor: { id: string };
  site: { id: string; name: string | null; code: string | null };
  assignedAt: string;
  assignedBy: SerializedAssignmentUser | null;
  endedAt: string | null;
  endedBy: SerializedAssignmentUser | null;
  isActive: boolean;
}

/**
 * References may arrive as an ObjectId or as a populated document. Handling
 * both keeps list/detail responses stable and avoids returning
 * `[object Object]` when a caller populates a name.
 */
function toRefId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }

  return String(value);
}

function toAssignmentUser(value: unknown): SerializedAssignmentUser | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && "_id" in value) {
    const populated = value as {
      _id: unknown;
      firstName?: unknown;
      lastName?: unknown;
    };

    return {
      id: String(populated._id),
      firstName:
        typeof populated.firstName === "string" ? populated.firstName : "",
      lastName:
        typeof populated.lastName === "string" ? populated.lastName : "",
    };
  }

  return { id: String(value), firstName: "", lastName: "" };
}

function toAssignmentSite(value: unknown): {
  id: string;
  name: string | null;
  code: string | null;
} {
  if (typeof value === "object" && value !== null && "_id" in value) {
    const populated = value as {
      _id: unknown;
      name?: unknown;
      code?: unknown;
    };

    return {
      id: String(populated._id),
      name: typeof populated.name === "string" ? populated.name : null,
      code: typeof populated.code === "string" ? populated.code : null,
    };
  }

  return { id: String(value), name: null, code: null };
}

function toIsoOrNull(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

/** Whitelists contractor personnel response fields and converts the Mongo document to a JSON-safe shape. */
export function toContractorPersonnelSummary(
  personnel: ContractorPersonnelLike,
  options: ContractorPersonnelSummaryOptions = {},
): SerializedContractorPersonnel {
  return {
    id: String(personnel._id),
    contractor: {
      id: toRefId(personnel.contractor) ?? String(personnel.contractor),
    },
    firstName: personnel.firstName,
    lastName: personnel.lastName,
    personnelId: personnel.personnelId ?? null,
    jobTitle: personnel.jobTitle ?? null,
    phone: personnel.phone ?? null,
    email: personnel.email ?? null,
    site: personnel.site
      ? { id: toRefId(personnel.site) ?? String(personnel.site) }
      : null,
    activeSites: (options.activeSites ?? []).map((site) => ({
      id: site.id,
      name: site.name ?? null,
    })),
    isActive: personnel.isActive,
    createdAt: personnel.createdAt.toISOString(),
    updatedAt: personnel.updatedAt.toISOString(),
  };
}

/** Whitelists a personnel site assignment, including preserved history fields. */
export function toContractorPersonnelSiteAssignmentSummary(
  assignment: ContractorPersonnelSiteAssignmentLike,
): SerializedContractorPersonnelSiteAssignment {
  return {
    id: String(assignment._id),
    personnel: {
      id: toRefId(assignment.personnel) ?? String(assignment.personnel),
    },
    contractor: {
      id: toRefId(assignment.contractor) ?? String(assignment.contractor),
    },
    site: toAssignmentSite(assignment.site),
    assignedAt: assignment.assignedAt.toISOString(),
    assignedBy: toAssignmentUser(assignment.assignedBy),
    endedAt: toIsoOrNull(assignment.endedAt),
    endedBy: toAssignmentUser(assignment.endedBy),
    isActive: assignment.isActive,
  };
}
