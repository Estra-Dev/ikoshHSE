import { Types } from "mongoose";
import { HttpError } from "./http-error.js";
import { isHseManagementRole } from "./ikosh-constants.js";
import {
  INCIDENT_STATUSES,
  type IncidentStatus,
} from "./hse-constants.js";
import { assertSiteAccess, type SiteScopedViewer } from "./site-access.js";
import { Attachment } from "../models/Attachment.js";
import { Contractor } from "../models/Contractor.js";
import { Incident } from "../models/Incident.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { countDistinctActivePersonnelForSites } from "./contractor-personnel-assignments.js";

export interface HseDashboardFilters {
  projectId?: string;
  siteId?: string;
  from?: Date;
  to?: Date;
}

export interface HseDashboardViewer extends SiteScopedViewer {
  _id: unknown;
}

export interface HseDashboard {
  scope: {
    projectId: string | null;
    siteId: string | null;
    from: string | null;
    to: string | null;
  };
  totals: {
    projects: number;
    sites: number;
    contractors: number;
    contractorPersonnel: number;
    attachments: number;
    incidents: number;
    nearMisses: number;
  };
  incidents: {
    total: number;
    nearMisses: number;
    byStatus: Record<IncidentStatus, number>;
    byCategory: { category: string; count: number }[];
    unclassified: number;
    trend: { date: string; count: number }[];
  };
  lastUpdated: string;
}

interface IncidentFacets {
  totals: { total: number; nearMisses: number }[];
  byStatus: { _id: string; count: number }[];
  byCategory: { _id: string | null; count: number }[];
  trend: { _id: string; count: number }[];
}

function objectIds(values: readonly unknown[]): Types.ObjectId[] {
  return values
    .map((value) => String(value))
    .filter((value) => Types.ObjectId.isValid(value))
    .map((value) => new Types.ObjectId(value));
}

function buildOccurredAtFilter(
  from?: Date,
  to?: Date,
): Record<string, Date> | null {
  if (!from && !to) {
    return null;
  }

  return {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
}

/**
 * Builds role- and site-scoped HSE dashboard aggregates.
 *
 * HSE management sees all sites. Every other role is restricted to
 * `assignedSites`; an empty assignment yields zero counts rather than
 * unrestricted statistics. No employee personal information is included.
 */
export async function buildHseDashboard(
  viewer: HseDashboardViewer,
  filters: HseDashboardFilters = {},
): Promise<HseDashboard> {
  const isManager = isHseManagementRole(viewer.ikoshRole);

  let projectObjectId: Types.ObjectId | null = null;

  if (filters.projectId) {
    if (!Types.ObjectId.isValid(filters.projectId)) {
      throw new HttpError(400, "Invalid project ID.");
    }

    projectObjectId = new Types.ObjectId(filters.projectId);

    const projectExists = await Project.exists({ _id: projectObjectId });
    if (!projectExists) {
      throw new HttpError(404, "Project not found.");
    }
  }

  let siteObjectId: Types.ObjectId | null = null;

  if (filters.siteId) {
    if (!Types.ObjectId.isValid(filters.siteId)) {
      throw new HttpError(400, "Invalid site ID.");
    }

    siteObjectId = new Types.ObjectId(filters.siteId);

    const site = await Site.findById(siteObjectId)
      .select("project")
      .lean();

    if (!site) {
      throw new HttpError(404, "Site not found.");
    }

    assertSiteAccess(viewer, siteObjectId);

    if (
      projectObjectId &&
      String(site.project) !== String(projectObjectId)
    ) {
      throw new HttpError(
        400,
        "Site does not belong to the selected project.",
      );
    }
  }

  const assignedSiteIds = objectIds(viewer.assignedSites ?? []);

  // `null` means "no site restriction" (management with no site filter).
  let visibleSiteIds: Types.ObjectId[] | null;

  if (siteObjectId) {
    visibleSiteIds = [siteObjectId];
  } else if (!isManager) {
    if (projectObjectId) {
      const accessibleSite = await Site.exists({
        _id: { $in: assignedSiteIds },
        project: projectObjectId,
      });

      if (!accessibleSite) {
        throw new HttpError(404, "Project not found.");
      }

      visibleSiteIds = objectIds(
        await Site.distinct("_id", {
          _id: { $in: assignedSiteIds },
          project: projectObjectId,
        }),
      );
    } else {
      visibleSiteIds = assignedSiteIds;
    }
  } else if (projectObjectId) {
    visibleSiteIds = objectIds(
      await Site.distinct("_id", { project: projectObjectId }),
    );
  } else {
    visibleSiteIds = null;
  }

  const projectIds: Types.ObjectId[] | null = projectObjectId
    ? [projectObjectId]
    : visibleSiteIds !== null
      ? objectIds(
          await Site.distinct("project", { _id: { $in: visibleSiteIds } }),
        )
      : null;

  const siteCountFilter =
    visibleSiteIds === null ? {} : { _id: { $in: visibleSiteIds } };

  let contractorCountFilter: Record<string, unknown> = {};

  if (projectIds !== null) {
    contractorCountFilter =
      projectIds.length === 0 ? { _id: { $in: [] } } : { projects: { $in: projectIds } };
  }

  let attachmentFilter: Record<string, unknown> = {};

  if (!(isManager && visibleSiteIds === null)) {
    const visibleIncidentIds =
      visibleSiteIds !== null && visibleSiteIds.length > 0
        ? objectIds(
            await Incident.distinct("_id", {
              site: { $in: visibleSiteIds },
            }),
          )
        : [];

    const visibility: Record<string, unknown>[] = [];

    if (!isManager) {
      visibility.push({ uploadedBy: viewer._id });
    }

    if (visibleSiteIds !== null && visibleSiteIds.length > 0) {
      visibility.push({
        entityType: "site",
        entityId: { $in: visibleSiteIds },
      });

      if (visibleIncidentIds.length > 0) {
        visibility.push({
          entityType: "incident",
          entityId: { $in: visibleIncidentIds },
        });
      }
    }

    attachmentFilter =
      visibility.length === 0
        ? { _id: { $in: [] } }
        : { $or: visibility };
  }

  const incidentMatch: Record<string, unknown> = {};

  if (visibleSiteIds !== null) {
    incidentMatch.site = { $in: visibleSiteIds };
  }

  const occurredAt = buildOccurredAtFilter(filters.from, filters.to);
  if (occurredAt) {
    incidentMatch.occurredAt = occurredAt;
  }

  const [
    projectTotal,
    siteTotal,
    contractorTotal,
    personnelTotal,
    attachmentTotal,
    incidentFacets,
  ] = await Promise.all([
    projectObjectId
      ? Promise.resolve(1)
      : projectIds !== null
        ? Project.countDocuments({ _id: { $in: projectIds } })
        : Project.countDocuments(),
    Site.countDocuments(siteCountFilter),
    Contractor.countDocuments(contractorCountFilter),
    countDistinctActivePersonnelForSites(visibleSiteIds),
    Attachment.countDocuments(attachmentFilter),
    Incident.aggregate<IncidentFacets>([
      { $match: incidentMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                nearMisses: {
                  $sum: {
                    $cond: [{ $eq: ["$type", "NEAR_MISS"] }, 1, 0],
                  },
                },
              },
            },
          ],
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byCategory: [
            { $group: { _id: "$category", count: { $sum: 1 } } },
          ],
          trend: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$occurredAt",
                    timezone: "UTC",
                  },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]),
  ]);

  const facets = incidentFacets[0];
  const totalsRow = facets?.totals[0];
  const incidentTotal = totalsRow?.total ?? 0;
  const nearMisses = totalsRow?.nearMisses ?? 0;

  const byStatus = Object.fromEntries(
    INCIDENT_STATUSES.map((status) => [status, 0]),
  ) as Record<IncidentStatus, number>;

  for (const row of facets?.byStatus ?? []) {
    if (Object.hasOwn(byStatus, row._id)) {
      byStatus[row._id as IncidentStatus] = row.count;
    }
  }

  const byCategory: { category: string; count: number }[] = [];
  let unclassified = 0;

  for (const row of facets?.byCategory ?? []) {
    if (row._id === null) {
      unclassified = row.count;
    } else {
      byCategory.push({ category: row._id, count: row.count });
    }
  }

  byCategory.sort(
    (left, right) =>
      right.count - left.count ||
      left.category.localeCompare(right.category),
  );

  const trend = (facets?.trend ?? []).map((row) => ({
    date: row._id,
    count: row.count,
  }));

  return {
    scope: {
      projectId: projectObjectId ? String(projectObjectId) : null,
      siteId: siteObjectId ? String(siteObjectId) : null,
      from: filters.from ? filters.from.toISOString() : null,
      to: filters.to ? filters.to.toISOString() : null,
    },
    totals: {
      projects: projectTotal,
      sites: siteTotal,
      contractors: contractorTotal,
      contractorPersonnel: personnelTotal,
      attachments: attachmentTotal,
      incidents: incidentTotal,
      nearMisses,
    },
    incidents: {
      total: incidentTotal,
      nearMisses,
      byStatus,
      byCategory,
      unclassified,
      trend,
    },
    lastUpdated: new Date().toISOString(),
  };
}
