import {
  Types,
  type ClientSession,
  type HydratedDocument,
} from "mongoose";
import { HttpError } from "./http-error.js";
import { Contractor, type ContractorDocument } from "../models/Contractor.js";
import {
  ContractorPersonnel,
  type ContractorPersonnelDocument,
} from "../models/ContractorPersonnel.js";
import { Site, type SiteDocument } from "../models/Site.js";
import { ContractorPersonnelSiteAssignment } from "../models/ContractorPersonnelSiteAssignment.js";

export interface AssignableSiteContext {
  personnel: HydratedDocument<ContractorPersonnelDocument>;
  contractor: HydratedDocument<ContractorDocument>;
  site: HydratedDocument<SiteDocument>;
}

/**
 * Shared eligibility checks for creating a contractor personnel site
 * assignment.
 *
 * Rules:
 * - the contractor and personnel must exist and be active;
 * - the site must exist and be active;
 * - the site's project must be associated with the contractor;
 * - the personnel must not already have an active assignment to the site.
 *
 * The unique partial index on the assignment model is the final guard against
 * concurrent duplicate creates.
 */
export async function assertAssignableSite({
  personnelId,
  siteId,
  session,
}: {
  personnelId: string;
  siteId: string;
  session?: ClientSession;
}): Promise<AssignableSiteContext> {
  const personnel = await ContractorPersonnel.findById(personnelId).session(
    session ?? null,
  );

  if (!personnel) {
    throw new HttpError(404, "Contractor personnel not found.");
  }

  if (!personnel.isActive) {
    throw new HttpError(
      409,
      "Inactive contractor personnel cannot receive new site assignments.",
    );
  }

  const contractor = await Contractor.findById(personnel.contractor).session(
    session ?? null,
  );

  if (!contractor) {
    throw new HttpError(404, "Contractor not found.");
  }

  if (!contractor.isActive) {
    throw new HttpError(
      409,
      "Inactive contractors cannot receive new site assignments.",
    );
  }

  const site = await Site.findById(siteId).session(session ?? null);

  if (!site) {
    throw new HttpError(404, "Specified site was not found.");
  }

  if (site.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "Only active sites can receive new contractor personnel assignments.",
    );
  }

  const contractorProjectIds = (contractor.projects ?? []).map((projectId) =>
    String(projectId),
  );

  if (!contractorProjectIds.includes(String(site.project))) {
    throw new HttpError(
      409,
      "The site's project is not associated with this contractor.",
    );
  }

  const duplicate = await ContractorPersonnelSiteAssignment.findOne({
    personnel: personnel._id,
    site: site._id,
    isActive: true,
  }).session(session ?? null);

  if (duplicate) {
    throw new HttpError(
      409,
      "This personnel already has an active assignment to this site.",
    );
  }

  return { personnel, contractor, site };
}

function uniqueObjectIds(values: readonly unknown[]): Types.ObjectId[] {
  const unique = new Map<string, Types.ObjectId>();

  for (const value of values) {
    const id =
      value instanceof Types.ObjectId
        ? value
        : new Types.ObjectId(String(value));
    unique.set(String(id), id);
  }

  return [...unique.values()];
}

/**
 * Personnel ids effectively assigned to the given sites.
 *
 * While the legacy `ContractorPersonnel.site` field is still present, the
 * result includes both new active assignment records and legacy values. This
 * keeps list filtering correct before the backfill is verified.
 */
export async function personnelIdsAssignedToSites(
  siteIds: readonly Types.ObjectId[],
): Promise<Types.ObjectId[]> {
  if (siteIds.length === 0) {
    return [];
  }

  const [assignmentPersonnelIds, legacyPersonnelIds] = await Promise.all([
    ContractorPersonnelSiteAssignment.distinct("personnel", {
      site: { $in: siteIds },
      isActive: true,
    }),
    ContractorPersonnel.distinct("_id", {
      site: { $in: siteIds },
    }),
  ]);

  return uniqueObjectIds([...assignmentPersonnelIds, ...legacyPersonnelIds]);
}

/**
 * Distinct, active personnel assigned to the visible sites.
 *
 * `null` means "all visible sites" and counts only active personnel that are
 * actually assigned (new assignment or legacy `site`), not unassigned staff.
 */
export async function countDistinctActivePersonnelForSites(
  siteIds: readonly Types.ObjectId[] | null,
): Promise<number> {
  if (siteIds !== null && siteIds.length === 0) {
    return 0;
  }

  const assignmentFilter: Record<string, unknown> = { isActive: true };
  const legacyFilter: Record<string, unknown> = {
    isActive: true,
    site: { $ne: null },
  };

  if (siteIds !== null) {
    assignmentFilter.site = { $in: siteIds };
    legacyFilter.site = { $in: siteIds };
  }

  const [assignmentPersonnelIds, legacyPersonnelIds] = await Promise.all([
    ContractorPersonnelSiteAssignment.distinct(
      "personnel",
      assignmentFilter,
    ),
    ContractorPersonnel.distinct("_id", legacyFilter),
  ]);

  const candidateIds = uniqueObjectIds([
    ...assignmentPersonnelIds,
    ...legacyPersonnelIds,
  ]);

  if (candidateIds.length === 0) {
    return 0;
  }

  // Assignment rows do not know whether the person is still active, so the
  // personnel record is the authority for the final active filter.
  return ContractorPersonnel.countDocuments({
    _id: { $in: candidateIds },
    isActive: true,
  });
}

/** True when personnel have any active assignment record. */
export async function hasActiveAssignmentsForPersonnel(
  personnelId: Types.ObjectId,
  session?: ClientSession,
): Promise<boolean> {
  const assignment = await ContractorPersonnelSiteAssignment.exists({
    personnel: personnelId,
    isActive: true,
  }).session(session ?? null);

  return assignment !== null;
}

/**
 * True when removing any of the given projects would strand active personnel
 * assignments at that project's sites.
 *
 * Legacy `ContractorPersonnel.site` values are treated as assignments too
 * until the backfill has been verified.
 */
export async function hasActiveAssignmentsForProjects(
  contractorId: Types.ObjectId,
  projectIds: readonly Types.ObjectId[],
  session?: ClientSession,
): Promise<boolean> {
  if (projectIds.length === 0) {
    return false;
  }

  const sites = await Site.find({ project: { $in: projectIds } })
    .select("_id")
    .session(session ?? null)
    .lean();

  const siteIds = sites.map((site) => site._id);

  if (siteIds.length === 0) {
    return false;
  }

  const [activeAssignmentCount, legacyPersonnelCount] = await Promise.all([
    ContractorPersonnelSiteAssignment.countDocuments({
      contractor: contractorId,
      site: { $in: siteIds },
      isActive: true,
    }).session(session ?? null),
    ContractorPersonnel.countDocuments({
      contractor: contractorId,
      site: { $in: siteIds },
      isActive: true,
    }).session(session ?? null),
  ]);

  return activeAssignmentCount > 0 || legacyPersonnelCount > 0;
}
