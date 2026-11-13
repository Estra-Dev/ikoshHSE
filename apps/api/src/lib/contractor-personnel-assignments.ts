import type { ClientSession, HydratedDocument } from "mongoose";
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
