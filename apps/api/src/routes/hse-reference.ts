import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { Types } from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  INJURED_BODY_PARTS,
  PERMIT_TO_WORK_TYPES,
  PROJECT_STATUSES,
  SITE_STATUSES,
  WASTE_TYPES,
} from "../lib/hse-constants.js";
import { buildHseDashboard } from "../lib/hse-dashboard.js";
import { auditLogQuerySchema } from "../lib/validation/audit-log.js";
import { firstValidationIssue } from "../lib/validation/common.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { AuditLog } from "../models/AuditLog.js";
import { toAuditLogSummary } from "../serializers/audit-log.js";

const router: Router = Router();

// Every HSE route requires an authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

function parseDateQuery(value: unknown, name: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `Invalid ${name} date.`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `Invalid ${name} date.`);
  }

  return date;
}

/**
 * HSE reference data (read-only, visible to all authenticated employees).
 *
 * Values are sourced from the same constants used by models and validation so
 * client lookup lists can never drift from server behavior.
 */
router.get(
  "/reference",
  async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      data: {
        incidentCategories: [...INCIDENT_CATEGORIES],
        incidentTypes: [...INCIDENT_TYPES],
        incidentStatuses: [...INCIDENT_STATUSES],
        injuredBodyParts: [...INJURED_BODY_PARTS],
        permitToWorkTypes: [...PERMIT_TO_WORK_TYPES],
        wasteTypes: [...WASTE_TYPES],
        projectStatuses: [...PROJECT_STATUSES],
        siteStatuses: [...SITE_STATUSES],
      },
    });
  },
);

/**
 * Site- and role-scoped HSE dashboard aggregates.
 *
 * HSE management sees all sites; other roles see only their assigned sites.
 * Incidents support daily trend and status/category breakdowns, with optional
 * project, site and occurred-at date-range filters.
 */
router.get(
  "/dashboard",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);

    const projectId =
      typeof req.query.projectId === "string"
        ? req.query.projectId
        : undefined;
    const siteId =
      typeof req.query.siteId === "string" ? req.query.siteId : undefined;
    const from = parseDateQuery(req.query.from, "from");
    const to = parseDateQuery(req.query.to, "to");

    if (from && to && from.getTime() > to.getTime()) {
      throw new HttpError(400, "The from date must not be after the to date.");
    }

    const data = await buildHseDashboard(viewer, {
      projectId,
      siteId,
      from,
      to,
    });

    res.status(200).json({
      success: true,
      data,
    });
  },
);

/** Audit log query endpoint (read-only, HSE_MANAGER + ADMIN only). */
router.get(
  "/audit-log",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req, res) => {
    const parsed = auditLogQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { entityType, entityId, action, limit = 50 } = parsed.data;

    const filter: Record<string, unknown> = {};

    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = new Types.ObjectId(entityId);
    if (action) filter.action = action;

    const results = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: {
        auditLog: results.map(toAuditLogSummary),
      },
    });
  },
);

export default router;
