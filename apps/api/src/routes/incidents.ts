import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { Types } from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  classifyIncidentSchema,
  createIncidentSchema,
  updateIncidentSchema,
  updateIncidentStatusSchema,
} from "../lib/validation/incident.js";
import {
  canTransitionIncidentStatus,
  isIncidentStatus,
  isIncidentType,
  type IncidentStatus,
} from "../lib/hse-constants.js";
import { canReportIncident } from "../lib/hse-permissions.js";
import { assertSiteAccess, siteScopeFilter } from "../lib/site-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { incidentAuditSnapshot } from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { Incident } from "../models/Incident.js";
import { Site } from "../models/Site.js";
import { toIncidentSummary } from "../serializers/incident.js";

const router: Router = Router();

// Every incident route requires an authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// List incidents visible to the caller. HSE management sees every site; other
// employees see only incidents at their assigned sites.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const type =
    typeof req.query.type === "string" ? req.query.type : undefined;

  if (siteId && !Types.ObjectId.isValid(siteId)) {
    throw new HttpError(400, "Invalid site ID.");
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  if (status !== undefined && !isIncidentStatus(status)) {
    throw new HttpError(400, "Invalid incident status.");
  }

  if (type !== undefined && !isIncidentType(type)) {
    throw new HttpError(400, "Invalid incident type.");
  }

  const filter: Record<string, unknown> = {};

  if (siteId) {
    filter.site = new Types.ObjectId(siteId);
  } else {
    Object.assign(filter, siteScopeFilter(viewer, "site"));
  }

  if (status) filter.status = status;
  if (type) filter.type = type;

  const { page, limit, skip } = parsePagination(req.query);

  const [total, incidents] = await Promise.all([
    Incident.countDocuments(filter),
    Incident.find(filter)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    incidents: incidents.map(toIncidentSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Report an incident or near-miss at a site the caller can access.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canReportIncident(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to report incidents.");
  }

  const parsed = createIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const {
    siteId,
    type,
    title,
    description,
    occurredAt,
    location,
    immediateActions,
  } = parsed.data;

  const incident = await runAuditedMutation(viewer._id, async (session) => {
    const site = await Site.findById(siteId).session(session);

    if (!site) {
      throw new HttpError(404, "Specified site was not found.");
    }

    assertSiteAccess(viewer, siteId);

    const created = new Incident({
      site: new Types.ObjectId(siteId),
      reportedBy: viewer._id,
      type: type ?? "INCIDENT",
      title,
      description,
      occurredAt,
      location,
      immediateActions,
      // Classification and status are management-controlled. Reporters can
      // never supply these values, even by adding extra request fields.
      category: null,
      status: "REPORTED",
    });

    await created.save({ session });

    return {
      result: created,
      audit: {
        action: "incident.created",
        entityType: "Incident",
        entityId: created._id,
        after: incidentAuditSnapshot(created),
      },
    };
  });

  res.status(201).json({
    success: true,
    incident: toIncidentSummary(incident),
  });
});

// Read a single incident. Site-scoped employees receive 404 for incidents at
// sites they are not assigned to so existence is not leaked.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const incidentId = parseObjectIdParam(req.params.id, "incident");

  const incident = await Incident.findById(incidentId);

  if (!incident) {
    throw new HttpError(404, "Incident not found.");
  }

  assertSiteAccess(viewer, incident.site);

  res.status(200).json({
    success: true,
    incident: toIncidentSummary(incident),
  });
});

// Update report content. Reporters may only edit their own incident before it
// is triaged; HSE management may edit any incident.
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const incidentId = parseObjectIdParam(req.params.id, "incident");

  const parsed = updateIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const incident = await runAuditedMutation(viewer._id, async (session) => {
    const incident = await Incident.findById(incidentId).session(session);

    if (!incident) {
      throw new HttpError(404, "Incident not found.");
    }

    assertSiteAccess(viewer, incident.site);

    if (viewer.ikoshRole !== "HSE_MANAGER" && viewer.ikoshRole !== "ADMIN") {
      if (String(incident.reportedBy) !== String(viewer._id)) {
        throw new HttpError(
          403,
          "Only the reporter or HSE management can update this incident.",
        );
      }

      if (incident.status !== "REPORTED") {
        throw new HttpError(
          409,
          "Only incidents in REPORTED status can be edited by the reporter.",
        );
      }
    }

    const before = incidentAuditSnapshot(incident);

    const {
      type,
      title,
      description,
      occurredAt,
      location,
      immediateActions,
    } = parsed.data;

    if (type !== undefined) incident.type = type;
    if (title !== undefined) incident.title = title;
    if (description !== undefined) incident.description = description;
    if (occurredAt !== undefined) incident.occurredAt = occurredAt;
    if (location !== undefined) incident.location = location;
    if (immediateActions !== undefined) {
      incident.immediateActions = immediateActions;
    }

    await incident.save({ session });

    return {
      result: incident,
      audit: {
        action: "incident.updated",
        entityType: "Incident",
        entityId: incident._id,
        before,
        after: incidentAuditSnapshot(incident),
      },
    };
  });

  res.status(200).json({
    success: true,
    incident: toIncidentSummary(incident),
  });
});

// Classify an incident (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id/classification",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const incidentId = parseObjectIdParam(req.params.id, "incident");

    const parsed = classifyIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const incident = await runAuditedMutation(viewer._id, async (session) => {
      const incident = await Incident.findById(incidentId).session(session);

      if (!incident) {
        throw new HttpError(404, "Incident not found.");
      }

      const before = incidentAuditSnapshot(incident);

      incident.category = parsed.data.category;
      incident.classifiedBy = viewer._id;
      incident.classifiedAt = new Date();

      await incident.save({ session });

      return {
        result: incident,
        audit: {
          action: "incident.classified",
          entityType: "Incident",
          entityId: incident._id,
          before,
          after: incidentAuditSnapshot(incident),
        },
      };
    });

    res.status(200).json({
      success: true,
      incident: toIncidentSummary(incident),
    });
  },
);

// Change incident workflow status (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id/status",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const incidentId = parseObjectIdParam(req.params.id, "incident");

    const parsed = updateIncidentStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const incident = await runAuditedMutation(viewer._id, async (session) => {
      const incident = await Incident.findById(incidentId).session(session);

      if (!incident) {
        throw new HttpError(404, "Incident not found.");
      }

      if (
        !canTransitionIncidentStatus(
          incident.status as IncidentStatus,
          parsed.data.status,
        )
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${incident.status} to ${parsed.data.status}.`,
        );
      }

      const before = incidentAuditSnapshot(incident);
      incident.status = parsed.data.status;
      incident.statusUpdatedBy = viewer._id;
      incident.statusUpdatedAt = new Date();

      await incident.save({ session });

      return {
        result: incident,
        audit: {
          action: "incident.status_changed",
          entityType: "Incident",
          entityId: incident._id,
          before,
          after: incidentAuditSnapshot(incident),
        },
      };
    });

    res.status(200).json({
      success: true,
      incident: toIncidentSummary(incident),
    });
  },
);

export default router;
