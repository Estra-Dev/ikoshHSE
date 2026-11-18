import { Types } from "mongoose";
import { HttpError } from "./http-error.js";
import { canViewAllSites } from "./hse-permissions.js";
import {
  AUDIT_STATUSES,
  AUDIT_TYPES,
  CORRECTIVE_ACTION_STATUSES,
  INCIDENT_STATUSES,
  INSPECTION_SEVERITIES,
  INSPECTION_STATUSES,
  PERMIT_STATUSES,
  RISK_ASSESSMENT_STATUSES,
  RISK_LEVELS,
  TRAINING_SESSION_STATUSES,
} from "./hse-constants.js";
import { assertSiteAccess, type SiteScopedViewer } from "./site-access.js";
import { incidentScopeFilter } from "./incident-access.js";
import { inspectionScopeFilter } from "./inspection-access.js";
import { hseAuditScopeFilter } from "./hse-audit-access.js";
import { permitScopeFilter } from "./permit-access.js";
import { correctiveActionScopeFilter } from "./corrective-action-access.js";
import { riskAssessmentScopeFilter } from "./risk-assessment-access.js";
import { trainingScopeFilter } from "./training-access.js";
import { toolboxTalkScopeFilter } from "./toolbox-talk-access.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { HseAudit } from "../models/HseAudit.js";
import { Incident } from "../models/Incident.js";
import { Inspection } from "../models/Inspection.js";
import { Permit } from "../models/Permit.js";
import { Project } from "../models/Project.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { Site } from "../models/Site.js";
import { ToolboxTalk } from "../models/ToolboxTalk.js";
import { TrainingSession } from "../models/TrainingSession.js";

export interface HseReportFilters {
  projectId?: string;
  siteId?: string;
  from?: string;
  to?: string;
}

export interface HseReportViewer extends SiteScopedViewer {
  _id: unknown;
}

interface ResolvedReportScope {
  projectId: Types.ObjectId | null;
  siteId: Types.ObjectId | null;
  siteIds: Types.ObjectId[] | null;
  from?: Date;
  to?: Date;
}

export interface HseReport {
  scope: {
    projectId: string | null;
    siteId: string | null;
    from: string | null;
    to: string | null;
  };
  generatedAt: string;
  incidents: {
    total: number;
    incidents: number;
    nearMisses: number;
    byStatus: Record<string, number>;
    byCategory: { category: string; count: number }[];
    unclassified: number;
  };
  inspections: {
    total: number;
    byStatus: Record<string, number>;
    findingsTotal: number;
    findingsBySeverity: Record<string, number>;
  };
  audits: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    findingsTotal: number;
    findingsBySeverity: Record<string, number>;
    checklistByResult: Record<string, number>;
  };
  permits: {
    total: number;
    byStatus: Record<string, number>;
    byWorkType: { workType: string; count: number }[];
    expiringSoon: number;
  };
  correctiveActions: {
    total: number;
    byStatus: Record<string, number>;
    overdue: number;
  };
  riskAssessments: {
    total: number;
    byStatus: Record<string, number>;
    hazardsTotal: number;
    hazardsByResidualLevel: Record<string, number>;
    reviewsDue: number;
  };
  training: {
    sessions: number;
    byStatus: Record<string, number>;
    attendance: {
      invited: number;
      attended: number;
      absent: number;
      completed: number;
      certificatesIssued: number;
      employees: number;
      contractors: number;
    };
  };
  toolboxTalks: {
    talks: number;
    byStatus: Record<string, number>;
    attendance: {
      invited: number;
      attended: number;
      absent: number;
      acknowledged: number;
      employees: number;
      contractors: number;
    };
  };
}

interface GroupRow {
  _id: string | null;
  count: number;
}

interface IncidentFacets {
  totals: {
    total: number;
    incidents: number;
    nearMisses: number;
  }[];
  byStatus: GroupRow[];
  byCategory: GroupRow[];
}

interface StatusFacets {
  byStatus: GroupRow[];
}

interface InspectionFacets extends StatusFacets {
  findingsBySeverity: GroupRow[];
}

interface AuditFacets extends StatusFacets {
  byType: GroupRow[];
  findingsBySeverity: GroupRow[];
  checklistByResult: GroupRow[];
}

interface PermitFacets extends StatusFacets {
  byWorkType: GroupRow[];
}

interface RiskFacets extends StatusFacets {
  hazardsByResidualLevel: GroupRow[];
}

interface AttendanceFacets extends StatusFacets {
  attendance: {
    invited: number;
    attended: number;
    absent: number;
    completed?: number;
    certificates?: number;
    acknowledged?: number;
    employees: number;
    contractors: number;
  }[];
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function objectIds(values: readonly unknown[]): Types.ObjectId[] {
  return values
    .map((value) => String(value))
    .filter((value) => Types.ObjectId.isValid(value))
    .map((value) => new Types.ObjectId(value));
}

function parseReportDate(
  value: string | undefined,
  edge: "start" | "end",
  label: string,
): Date | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const trimmed = value.trim();

  if (DATE_ONLY.test(trimmed)) {
    const suffix = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    const date = new Date(`${trimmed}${suffix}`);

    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== trimmed
    ) {
      throw new HttpError(400, `Invalid ${label} date.`);
    }

    return date;
  }

  const date = new Date(trimmed);

  if (!Number.isFinite(date.getTime())) {
    throw new HttpError(400, `Invalid ${label} date.`);
  }

  return date;
}

function zeroed(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(values.map((value) => [value, 0]));
}

function applyRows(
  target: Record<string, number>,
  rows: readonly GroupRow[],
): void {
  for (const row of rows) {
    if (row._id !== null && Object.hasOwn(target, row._id)) {
      target[row._id] = row.count;
    }
  }
}

function withDateRange(
  field: string,
  scope: ResolvedReportScope,
): Record<string, unknown> {
  if (!scope.from && !scope.to) {
    return {};
  }

  const range: Record<string, Date> = {};
  if (scope.from) range.$gte = scope.from;
  if (scope.to) range.$lte = scope.to;
  return { [field]: range };
}

function combine(...parts: Record<string, unknown>[]): Record<string, unknown> {
  const nonEmpty = parts.filter((part) => Object.keys(part).length > 0);
  return nonEmpty.length > 0 ? { $and: nonEmpty } : {};
}

/**
 * Project/site constraint for report queries. It narrows the module-specific
 * scope filters; it never broadens them.
 */

function scopeConstraint(
  viewer: HseReportViewer,
  scope: ResolvedReportScope,
): Record<string, unknown> {
  if (scope.siteId) {
    return { site: scope.siteId };
  }

  if (scope.projectId) {
    const projectConditions: Record<string, unknown>[] = [
      { site: { $in: scope.siteIds ?? [] } },
    ];

    if (canViewAllSites(viewer.ikoshRole)) {
      projectConditions.push({
        site: null,
        project: scope.projectId,
      });
    }

    return { $or: projectConditions };
  }

  return {};
}

async function resolveScope(
  viewer: HseReportViewer,
  filters: HseReportFilters,
): Promise<ResolvedReportScope> {
  const from = parseReportDate(filters.from, "start", "from");
  const to = parseReportDate(filters.to, "end", "to");

  if (from && to && from.getTime() > to.getTime()) {
    throw new HttpError(400, "The from date must not be after the to date.");
  }

  let projectObjectId: Types.ObjectId | null = null;

  if (filters.projectId) {
    projectObjectId = new Types.ObjectId(filters.projectId);

    if (!(await Project.exists({ _id: projectObjectId }))) {
      throw new HttpError(404, "Project not found.");
    }
  }

  let siteObjectId: Types.ObjectId | null = null;
  let siteIds: Types.ObjectId[] | null = null;

  if (filters.siteId) {
    siteObjectId = new Types.ObjectId(filters.siteId);
    const site = await Site.findById(siteObjectId).select("project").lean();

    if (!site) {
      throw new HttpError(404, "Site not found.");
    }

    assertSiteAccess(viewer, siteObjectId);

    if (projectObjectId && String(site.project) !== String(projectObjectId)) {
      throw new HttpError(400, "Site does not belong to the selected project.");
    }

    siteIds = [siteObjectId];
  } else if (canViewAllSites(viewer.ikoshRole)) {
    siteIds = projectObjectId
      ? objectIds(await Site.distinct("_id", { project: projectObjectId }))
      : null;
  } else {
    const assignedSiteIds = objectIds(viewer.assignedSites ?? []);

    if (projectObjectId) {
      siteIds = objectIds(
        await Site.distinct("_id", {
          _id: { $in: assignedSiteIds },
          project: projectObjectId,
        }),
      );

      if (siteIds.length === 0) {
        throw new HttpError(404, "Project not found.");
      }
    } else {
      siteIds = assignedSiteIds;
    }
  }

  return {
    projectId: projectObjectId,
    siteId: siteObjectId,
    siteIds,
    from,
    to,
  };
}

/** Builds cross-module HSE report aggregates from existing operational data. */
export async function buildHseReport(
  viewer: HseReportViewer,
  filters: HseReportFilters = {},
): Promise<HseReport> {
  const scope = await resolveScope(viewer, filters);
  const constraint = scopeConstraint(viewer, scope);
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Each module keeps the exact scope used by its own register: site access
  // plus records explicitly assigned to the viewer (reporter, inspector,
  // auditor, owner, responsible person or assignee). Reports never widen it.
  const incidentMatch = combine(
    incidentScopeFilter(viewer),
    constraint,
    withDateRange("occurredAt", scope),
  );
  const inspectionMatch = combine(
    inspectionScopeFilter(viewer),
    constraint,
    withDateRange("scheduledFor", scope),
  );
  const auditMatch = combine(
    hseAuditScopeFilter(viewer),
    constraint,
    withDateRange("scheduledFor", scope),
  );
  const permitMatch = combine(
    permitScopeFilter(viewer),
    constraint,
    withDateRange("validFrom", scope),
  );
  const correctiveActionMatch = combine(
    correctiveActionScopeFilter(viewer),
    constraint,
    withDateRange("createdAt", scope),
  );
  const riskMatch = combine(
    riskAssessmentScopeFilter(viewer),
    constraint,
    withDateRange("createdAt", scope),
  );
  const trainingMatch = combine(
    trainingScopeFilter(viewer),
    constraint,
    withDateRange("scheduledDate", scope),
  );
  const toolboxMatch = combine(
    toolboxTalkScopeFilter(viewer),
    constraint,
    withDateRange("scheduledDate", scope),
  );

  const [
    incidentFacets,
    inspectionTotal,
    inspectionFacets,
    auditTotal,
    auditFacets,
    permitTotal,
    permitFacets,
    expiringSoon,
    correctiveActionTotal,
    correctiveActionFacets,
    overdueCorrectiveActions,
    riskTotal,
    riskFacets,
    riskReviewsDue,
    trainingFacets,
    toolboxFacets,
  ] = await Promise.all([
    Incident.aggregate<IncidentFacets>([
      { $match: incidentMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                incidents: {
                  $sum: { $cond: [{ $eq: ["$type", "INCIDENT"] }, 1, 0] },
                },
                nearMisses: {
                  $sum: { $cond: [{ $eq: ["$type", "NEAR_MISS"] }, 1, 0] },
                },
              },
            },
          ],
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byCategory: [
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
        },
      },
    ]),
    Inspection.countDocuments(inspectionMatch),
    Inspection.aggregate<InspectionFacets>([
      { $match: inspectionMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          findingsBySeverity: [
            { $unwind: "$findings" },
            { $group: { _id: "$findings.severity", count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    HseAudit.countDocuments(auditMatch),
    HseAudit.aggregate<AuditFacets>([
      { $match: auditMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byType: [{ $group: { _id: "$type", count: { $sum: 1 } } }],
          findingsBySeverity: [
            { $unwind: "$findings" },
            { $group: { _id: "$findings.severity", count: { $sum: 1 } } },
          ],
          checklistByResult: [
            { $unwind: "$checklist" },
            { $group: { _id: "$checklist.result", count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    Permit.countDocuments(permitMatch),
    Permit.aggregate<PermitFacets>([
      { $match: permitMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byWorkType: [
            { $group: { _id: "$workType", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
        },
      },
    ]),
    Permit.countDocuments(
      combine(permitScopeFilter(viewer), constraint, {
        status: { $in: ["APPROVED", "ACTIVE", "SUSPENDED"] },
        validTo: { $gte: now, $lte: soon },
      }),
    ),
    CorrectiveAction.countDocuments(correctiveActionMatch),
    CorrectiveAction.aggregate<StatusFacets>([
      { $match: correctiveActionMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        },
      },
    ]),
    CorrectiveAction.countDocuments(
      combine(correctiveActionScopeFilter(viewer), constraint, {
        status: { $in: ["OPEN", "IN_PROGRESS"] },
        dueDate: { $lt: now },
      }),
    ),
    RiskAssessment.countDocuments(riskMatch),
    RiskAssessment.aggregate<RiskFacets>([
      { $match: riskMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          hazardsByResidualLevel: [
            { $unwind: "$hazards" },
            {
              $group: {
                _id: "$hazards.residualLevel",
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
    RiskAssessment.countDocuments(
      combine(riskAssessmentScopeFilter(viewer), constraint, {
        status: "APPROVED",
        reviewDate: { $ne: null, $lte: now },
      }),
    ),
    TrainingSession.aggregate<AttendanceFacets>([
      { $match: trainingMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          attendance: [
            { $unwind: "$participants" },
            {
              $group: {
                _id: null,
                invited: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.attendance", "INVITED"] },
                      1,
                      0,
                    ],
                  },
                },
                attended: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.attendance", "ATTENDED"] },
                      1,
                      0,
                    ],
                  },
                },
                absent: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.attendance", "ABSENT"] },
                      1,
                      0,
                    ],
                  },
                },
                completed: {
                  $sum: {
                    $cond: [{ $eq: ["$participants.completed", true] }, 1, 0],
                  },
                },
                certificates: {
                  $sum: {
                    $cond: [
                      { $ne: ["$participants.certificateNumber", null] },
                      1,
                      0,
                    ],
                  },
                },
                employees: {
                  $sum: {
                    $cond: [{ $eq: ["$participants.kind", "EMPLOYEE"] }, 1, 0],
                  },
                },
                contractors: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.kind", "CONTRACTOR"] },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ]),
    ToolboxTalk.aggregate<AttendanceFacets>([
      { $match: toolboxMatch },
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          attendance: [
            { $unwind: "$participants" },
            {
              $group: {
                _id: null,
                invited: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.attendance", "INVITED"] },
                      1,
                      0,
                    ],
                  },
                },
                attended: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.attendance", "ATTENDED"] },
                      1,
                      0,
                    ],
                  },
                },
                absent: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.attendance", "ABSENT"] },
                      1,
                      0,
                    ],
                  },
                },
                acknowledged: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.acknowledged", true] },
                      1,
                      0,
                    ],
                  },
                },
                employees: {
                  $sum: {
                    $cond: [{ $eq: ["$participants.kind", "EMPLOYEE"] }, 1, 0],
                  },
                },
                contractors: {
                  $sum: {
                    $cond: [
                      { $eq: ["$participants.kind", "CONTRACTOR"] },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ]),
  ]);

  const incident = incidentFacets[0];
  const incidentTotals = incident?.totals[0];
  const incidentByStatus = zeroed(INCIDENT_STATUSES);
  applyRows(incidentByStatus, incident?.byStatus ?? []);

  const incidentByCategory: { category: string; count: number }[] = [];
  let unclassified = 0;

  for (const row of incident?.byCategory ?? []) {
    if (row._id === null) {
      unclassified = row.count;
    } else {
      incidentByCategory.push({ category: row._id, count: row.count });
    }
  }

  const inspectionStatus = zeroed(INSPECTION_STATUSES);
  const inspectionSeverity = zeroed(INSPECTION_SEVERITIES);
  applyRows(inspectionStatus, inspectionFacets[0]?.byStatus ?? []);
  applyRows(inspectionSeverity, inspectionFacets[0]?.findingsBySeverity ?? []);

  const auditStatus = zeroed(AUDIT_STATUSES);
  const auditType = zeroed(AUDIT_TYPES);
  const auditSeverity = zeroed(INSPECTION_SEVERITIES);
  const auditChecklist = zeroed([
    "PENDING",
    "COMPLIANT",
    "NON_COMPLIANT",
    "NOT_APPLICABLE",
  ]);
  applyRows(auditStatus, auditFacets[0]?.byStatus ?? []);
  applyRows(auditType, auditFacets[0]?.byType ?? []);
  applyRows(auditSeverity, auditFacets[0]?.findingsBySeverity ?? []);
  applyRows(auditChecklist, auditFacets[0]?.checklistByResult ?? []);

  const permitStatus = zeroed(PERMIT_STATUSES);
  applyRows(permitStatus, permitFacets[0]?.byStatus ?? []);

  const correctiveActionStatus = zeroed(CORRECTIVE_ACTION_STATUSES);
  applyRows(correctiveActionStatus, correctiveActionFacets[0]?.byStatus ?? []);

  const riskStatus = zeroed(RISK_ASSESSMENT_STATUSES);
  const riskLevels = zeroed(RISK_LEVELS);
  applyRows(riskStatus, riskFacets[0]?.byStatus ?? []);
  applyRows(riskLevels, riskFacets[0]?.hazardsByResidualLevel ?? []);

  const trainingStatus = zeroed(TRAINING_SESSION_STATUSES);
  applyRows(trainingStatus, trainingFacets[0]?.byStatus ?? []);
  const trainingAttendance = trainingFacets[0]?.attendance[0];

  const toolboxStatus = zeroed(TRAINING_SESSION_STATUSES);
  applyRows(toolboxStatus, toolboxFacets[0]?.byStatus ?? []);
  const toolboxAttendance = toolboxFacets[0]?.attendance[0];

  const findingsTotal = Object.values(inspectionSeverity).reduce(
    (sum, count) => sum + count,
    0,
  );
  const auditFindingsTotal = Object.values(auditSeverity).reduce(
    (sum, count) => sum + count,
    0,
  );
  const hazardsTotal = Object.values(riskLevels).reduce(
    (sum, count) => sum + count,
    0,
  );

  return {
    scope: {
      projectId: scope.projectId ? String(scope.projectId) : null,
      siteId: scope.siteId ? String(scope.siteId) : null,
      from: scope.from ? scope.from.toISOString() : null,
      to: scope.to ? scope.to.toISOString() : null,
    },
    generatedAt: now.toISOString(),
    incidents: {
      total: incidentTotals?.total ?? 0,
      incidents: incidentTotals?.incidents ?? 0,
      nearMisses: incidentTotals?.nearMisses ?? 0,
      byStatus: incidentByStatus,
      byCategory: incidentByCategory,
      unclassified,
    },
    inspections: {
      total: inspectionTotal,
      byStatus: inspectionStatus,
      findingsTotal,
      findingsBySeverity: inspectionSeverity,
    },
    audits: {
      total: auditTotal,
      byStatus: auditStatus,
      byType: auditType,
      findingsTotal: auditFindingsTotal,
      findingsBySeverity: auditSeverity,
      checklistByResult: auditChecklist,
    },
    permits: {
      total: permitTotal,
      byStatus: permitStatus,
      byWorkType: (permitFacets[0]?.byWorkType ?? [])
        .filter((row): row is GroupRow & { _id: string } => row._id !== null)
        .map((row) => ({ workType: row._id, count: row.count })),
      expiringSoon,
    },
    correctiveActions: {
      total: correctiveActionTotal,
      byStatus: correctiveActionStatus,
      overdue: overdueCorrectiveActions,
    },
    riskAssessments: {
      total: riskTotal,
      byStatus: riskStatus,
      hazardsTotal,
      hazardsByResidualLevel: riskLevels,
      reviewsDue: riskReviewsDue,
    },
    training: {
      sessions: Object.values(trainingStatus).reduce(
        (sum, count) => sum + count,
        0,
      ),
      byStatus: trainingStatus,
      attendance: {
        invited: trainingAttendance?.invited ?? 0,
        attended: trainingAttendance?.attended ?? 0,
        absent: trainingAttendance?.absent ?? 0,
        completed: trainingAttendance?.completed ?? 0,
        certificatesIssued: trainingAttendance?.certificates ?? 0,
        employees: trainingAttendance?.employees ?? 0,
        contractors: trainingAttendance?.contractors ?? 0,
      },
    },
    toolboxTalks: {
      talks: Object.values(toolboxStatus).reduce(
        (sum, count) => sum + count,
        0,
      ),
      byStatus: toolboxStatus,
      attendance: {
        invited: toolboxAttendance?.invited ?? 0,
        attended: toolboxAttendance?.attended ?? 0,
        absent: toolboxAttendance?.absent ?? 0,
        acknowledged: toolboxAttendance?.acknowledged ?? 0,
        employees: toolboxAttendance?.employees ?? 0,
        contractors: toolboxAttendance?.contractors ?? 0,
      },
    },
  };
}
