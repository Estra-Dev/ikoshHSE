import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { Types, type ClientSession, type HydratedDocument } from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  createInspectionFindingSchema,
  createInspectionSchema,
  linkFindingCorrectiveActionSchema,
  updateInspectionSchema,
  updateInspectionStatusSchema,
} from "../lib/validation/inspection.js";
import {
  canTransitionInspectionStatus,
  INSPECTION_ASSIGNABLE_ROLES,
  isCorrectiveActionAssignableRole,
  isInspectionAssignableRole,
  isInspectionStatus,
  isInspectionType,
  type InspectionStatus,
} from "../lib/hse-constants.js";
import {
  canCreateInspections,
  canConductInspections,
} from "../lib/hse-permissions.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertInspectionAccess,
  inspectionScopeFilter,
} from "../lib/inspection-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import {
  correctiveActionAuditSnapshot,
  inspectionAuditSnapshot,
} from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { Inspection, type InspectionDocument } from "../models/Inspection.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { toCorrectiveActionSummary } from "../serializers/corrective-action.js";
import { toInspectionSummary } from "../serializers/inspection.js";

const router: Router = Router();

const INSPECTION_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "inspector", select: "firstName lastName" },
  { path: "completedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

const INSPECTION_DETAIL_POPULATE = [
  ...INSPECTION_POPULATE,
  { path: "findings.correctiveAction", select: "description status" },
];

const CORRECTIVE_ACTION_POPULATE = [
  { path: "incident", select: "type title" },
  { path: "inspection", select: "title" },
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "assignedTo", select: "firstName lastName" },
  { path: "completedBy", select: "firstName lastName" },
  { path: "verifiedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

// Every inspection route requires an authenticated, active IKOSH employee with
// at least read access to the register.
router.use(requireAuth(digitAuth), attachIkoshUser);
router.use(
  requireIkoshRole("ADMIN", "HSE_MANAGER", "HSE_OFFICER", "SUPERVISOR"),
);

/** Only active HSE personnel may be responsible for an inspection. */
async function assertAssignableInspector(
  inspectorId: string,
  session: ClientSession,
): Promise<void> {
  const inspector = await User.findById(inspectorId).session(session);

  if (
    !inspector ||
    !inspector.isActive ||
    !isInspectionAssignableRole(inspector.ikoshRole)
  ) {
    throw new HttpError(
      400,
      "Inspector must be an active HSE officer, manager or admin.",
    );
  }
}

/** Only active HSE staff may own a corrective action raised from a finding. */
async function assertAssignableActionOwner(
  assignedTo: string,
  session: ClientSession,
): Promise<void> {
  const assignee = await User.findById(assignedTo).session(session);

  if (
    !assignee ||
    !assignee.isActive ||
    !isCorrectiveActionAssignableRole(assignee.ikoshRole)
  ) {
    throw new HttpError(400, "Assignee must be an active HSE user.");
  }
}

/**
 * Resolves and validates the project/site pair. A site must exist and belong
 * to the selected project. Returns normalized ids for persistence.
 */
async function resolveProjectAndSite(
  session: ClientSession,
  projectId: string,
  siteId: string | null | undefined,
): Promise<{
  project: Types.ObjectId;
  site: Types.ObjectId | null;
}> {
  const project = await Project.findById(projectId).session(session);

  if (!project) {
    throw new HttpError(404, "Specified project was not found.");
  }

  if (siteId === null || siteId === undefined) {
    return { project: project._id, site: null };
  }

  const site = await Site.findById(siteId).session(session);

  if (!site) {
    throw new HttpError(404, "Specified site was not found.");
  }

  if (String(site.project) !== String(project._id)) {
    throw new HttpError(
      409,
      "The selected site does not belong to the selected project.",
    );
  }

  return { project: project._id, site: site._id };
}

function referenceId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && "_id" in value) {
    const id = (value as { _id: unknown })._id;
    return id === null || id === undefined ? null : String(id);
  }

  return String(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type InspectionDocumentWithFindings = HydratedDocument<InspectionDocument>;

interface FindingLike {
  _id?: unknown;
  description: string;
  severity: string;
  recommendation?: string | null;
  correctiveAction?: unknown;
}

function findFinding(
  inspection: InspectionDocumentWithFindings,
  findingId: string,
): FindingLike | undefined {
  return (inspection.findings ?? []).find(
    (finding) => String(finding._id) === findingId,
  );
}

// Assignable HSE staff for the scheduling form. Declared before `/:id` so the
// literal path is not captured as an identifier.
router.get("/assignees", async (_req: Request, res: Response): Promise<void> => {
  const users = await User.find({
    isActive: true,
    ikoshRole: { $in: [...INSPECTION_ASSIGNABLE_ROLES] },
  })
    .select("firstName lastName ikoshRole")
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  res.status(200).json({
    success: true,
    assignees: users.map((user) => ({
      id: String(user._id),
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      ikoshRole: user.ikoshRole,
    })),
  });
});

// Inspection register. HSE management sees everything; other HSE roles see
// inspections at their assigned sites and inspections assigned to them.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const inspectorId =
    typeof req.query.inspectorId === "string"
      ? req.query.inspectorId
      : undefined;
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;

  if (status !== undefined && !isInspectionStatus(status)) {
    throw new HttpError(400, "Invalid inspection status.");
  }

  if (type !== undefined && !isInspectionType(type)) {
    throw new HttpError(400, "Invalid inspection type.");
  }

  for (const [label, value] of [
    ["project", projectId],
    ["site", siteId],
    ["inspector", inspectorId],
  ] as const) {
    if (value !== undefined && !Types.ObjectId.isValid(value)) {
      throw new HttpError(400, `Invalid ${label} id.`);
    }
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const search = rawSearch?.trim();

  if (search && search.length > 200) {
    throw new HttpError(400, "Search text is too long.");
  }

  const conditions: Record<string, unknown>[] = [];
  const scope = inspectionScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (type) conditions.push({ type });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });
  if (inspectorId) {
    conditions.push({ inspector: new Types.ObjectId(inspectorId) });
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    conditions.push({
      $or: [{ title: pattern }, { description: pattern }],
    });
  }

  const filter =
    conditions.length > 0
      ? { $and: conditions }
      : ({} as Record<string, unknown>);

  const { page, limit, skip } = parsePagination(req.query);

  const [total, inspections] = await Promise.all([
    Inspection.countDocuments(filter),
    Inspection.find(filter)
      .sort({ scheduledFor: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(INSPECTION_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    inspections: inspections.map(toInspectionSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Schedule an inspection. The project is mandatory; the site is optional but
// must belong to the project. The inspector must be active HSE personnel.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateInspections(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to schedule inspections.");
  }

  const parsed = createInspectionSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const { title, type, projectId, siteId, inspectorId, scheduledFor } =
    parsed.data;

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const inspection = await runAuditedMutation(viewer._id, async (session) => {
    const resolved = await resolveProjectAndSite(session, projectId, siteId);

    await assertAssignableInspector(inspectorId, session);

    const created = new Inspection({
      title,
      type,
      status: "SCHEDULED",
      project: resolved.project,
      site: resolved.site,
      inspector: new Types.ObjectId(inspectorId),
      scheduledFor,
      description: parsed.data.description ?? "",
      createdBy: viewer._id,
    });

    await created.save({ session });

    return {
      result: created,
      audit: {
        action: "inspection.created",
        entityType: "Inspection",
        entityId: created._id,
        after: inspectionAuditSnapshot(created),
      },
    };
  });

  await inspection.populate(INSPECTION_DETAIL_POPULATE);

  res.status(201).json({
    success: true,
    inspection: toInspectionSummary(inspection),
  });
});

// Read one inspection. Out-of-scope inspections return 404 so existence is not
// leaked to non-management users.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const inspectionId = parseObjectIdParam(req.params.id, "inspection");

  const inspection = await Inspection.findById(inspectionId).populate(
    INSPECTION_DETAIL_POPULATE,
  );

  if (!inspection) {
    throw new HttpError(404, "Inspection not found.");
  }

  assertInspectionAccess(viewer, inspection);

  res.status(200).json({
    success: true,
    inspection: toInspectionSummary(inspection),
  });
});

// Update schedule metadata or reassign the inspector (HSE_MANAGER + ADMIN
// only). Completed and cancelled inspections are immutable.
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const inspectionId = parseObjectIdParam(req.params.id, "inspection");

    const parsed = updateInspectionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const inspection = await runAuditedMutation(viewer._id, async (session) => {
      const inspection = await Inspection.findById(inspectionId).session(
        session,
      );

      if (!inspection) {
        throw new HttpError(404, "Inspection not found.");
      }

      if (
        inspection.status === "COMPLETED" ||
        inspection.status === "CANCELLED"
      ) {
        throw new HttpError(
          409,
          "Completed or cancelled inspections cannot be edited.",
        );
      }

      const before = inspectionAuditSnapshot(inspection);
      const {
        title,
        type,
        projectId,
        siteId,
        inspectorId,
        scheduledFor,
        description,
      } = parsed.data;

      let nextProject = inspection.project;
      let nextSite = inspection.site;

      if (projectId !== undefined) {
        const project = await Project.findById(projectId).session(session);

        if (!project) {
          throw new HttpError(404, "Specified project was not found.");
        }

        nextProject = project._id;
      }

      if (siteId === null) {
        nextSite = null;
      } else if (siteId !== undefined) {
        const site = await Site.findById(siteId).session(session);

        if (!site) {
          throw new HttpError(404, "Specified site was not found.");
        }

        if (String(site.project) !== String(nextProject)) {
          throw new HttpError(
            409,
            "The selected site does not belong to the selected project.",
          );
        }

        nextSite = site._id;
      } else if (nextSite) {
        const existingSite = await Site.findById(nextSite).session(session);

        if (
          !existingSite ||
          String(existingSite.project) !== String(nextProject)
        ) {
          throw new HttpError(
            409,
            "The selected site does not belong to the selected project.",
          );
        }
      }

      // Linked corrective actions derive their project and site from this
      // inspection, so moving the inspection afterwards would break their
      // provenance and site-scoped visibility.
      const hasLinkedAction = (inspection.findings ?? []).some(
        (finding) => finding.correctiveAction,
      );

      if (
        hasLinkedAction &&
        (String(nextProject) !== String(inspection.project) ||
          referenceId(nextSite) !== referenceId(inspection.site))
      ) {
        throw new HttpError(
          409,
          "Project and site cannot change once a finding is linked to a corrective action.",
        );
      }

      if (inspectorId !== undefined) {
        await assertAssignableInspector(inspectorId, session);
        inspection.inspector = new Types.ObjectId(inspectorId);
      }

      if (title !== undefined) inspection.title = title;
      if (type !== undefined) inspection.type = type;
      if (description !== undefined) inspection.description = description;
      if (scheduledFor !== undefined) inspection.scheduledFor = scheduledFor;

      inspection.project = nextProject;
      inspection.site = nextSite;

      await inspection.save({ session });

      return {
        result: inspection,
        audit: {
          action: "inspection.updated",
          entityType: "Inspection",
          entityId: inspection._id,
          before,
          after: inspectionAuditSnapshot(inspection),
        },
      };
    });

    await inspection.populate(INSPECTION_DETAIL_POPULATE);

    res.status(200).json({
      success: true,
      inspection: toInspectionSummary(inspection),
    });
  },
);

// Progress, complete or cancel an inspection. The assigned inspector may move
// their own inspection forward; only HSE management may cancel.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const inspectionId = parseObjectIdParam(req.params.id, "inspection");

    const parsed = updateInspectionStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const nextStatus = parsed.data.status;

    const inspection = await runAuditedMutation(viewer._id, async (session) => {
      const inspection = await Inspection.findById(inspectionId).session(
        session,
      );

      if (!inspection) {
        throw new HttpError(404, "Inspection not found.");
      }

      if (!canConductInspections(viewer.ikoshRole)) {
        throw new HttpError(
          403,
          "You are not permitted to progress inspections.",
        );
      }

      const isManagement = isHseManagementRole(viewer.ikoshRole);
      const isInspector =
        String(inspection.inspector) === String(viewer._id);

      if (nextStatus === "CANCELLED" && !isManagement) {
        throw new HttpError(
          403,
          "Only HSE management can cancel an inspection.",
        );
      }

      if (nextStatus !== "CANCELLED" && !isManagement && !isInspector) {
        throw new HttpError(
          403,
          "Only the assigned inspector or HSE management can progress this inspection.",
        );
      }

      if (
        !canTransitionInspectionStatus(
          inspection.status as InspectionStatus,
          nextStatus,
        )
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${inspection.status} to ${nextStatus}.`,
        );
      }

      if (
        nextStatus === "COMPLETED" &&
        !parsed.data.completionNotes &&
        (inspection.findings ?? []).length === 0
      ) {
        throw new HttpError(
          400,
          "Record at least one finding or completion notes before completing an inspection.",
        );
      }

      const before = inspectionAuditSnapshot(inspection);

      inspection.status = nextStatus;

      if (nextStatus === "COMPLETED") {
        inspection.completionNotes = parsed.data.completionNotes ?? null;
        inspection.completedAt = new Date();
        inspection.completedBy = viewer._id;
      }

      await inspection.save({ session });

      return {
        result: inspection,
        audit: {
          action: "inspection.status_changed",
          entityType: "Inspection",
          entityId: inspection._id,
          before,
          after: inspectionAuditSnapshot(inspection),
        },
      };
    });

    await inspection.populate(INSPECTION_DETAIL_POPULATE);

    res.status(200).json({
      success: true,
      inspection: toInspectionSummary(inspection),
    });
  },
);

// Record a finding. Findings may only be added while the inspection is
// scheduled or in progress.
router.post(
  "/:id/findings",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const inspectionId = parseObjectIdParam(req.params.id, "inspection");

    if (!canConductInspections(viewer.ikoshRole)) {
      throw new HttpError(403, "You are not permitted to record findings.");
    }

    const parsed = createInspectionFindingSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const inspection = await runAuditedMutation(viewer._id, async (session) => {
      const inspection = await Inspection.findById(inspectionId).session(
        session,
      );

      if (!inspection) {
        throw new HttpError(404, "Inspection not found.");
      }

      const isManagement = isHseManagementRole(viewer.ikoshRole);
      const isInspector =
        String(inspection.inspector) === String(viewer._id);

      if (!isManagement && !isInspector) {
        throw new HttpError(
          403,
          "Only the assigned inspector or HSE management can record findings.",
        );
      }

      if (
        inspection.status === "COMPLETED" ||
        inspection.status === "CANCELLED"
      ) {
        throw new HttpError(
          409,
          "Findings cannot be added to a completed or cancelled inspection.",
        );
      }

      inspection.findings.push({
        description: parsed.data.description,
        severity: parsed.data.severity,
        recommendation: parsed.data.recommendation ?? null,
        correctiveAction: null,
        createdBy: viewer._id,
      });

      await inspection.save({ session });

      return {
        result: inspection,
        audit: {
          action: "inspection.finding_added",
          entityType: "Inspection",
          entityId: inspection._id,
          after: inspectionAuditSnapshot(inspection),
        },
      };
    });

    await inspection.populate(INSPECTION_DETAIL_POPULATE);

    res.status(201).json({
      success: true,
      inspection: toInspectionSummary(inspection),
    });
  },
);

// Raise a corrective action from one finding. The CAPA, the finding backlink
// and both audit rows are written in a single transaction so the pair cannot
// diverge. Project and site are derived from the inspection.
router.post(
  "/:id/findings/:findingId/corrective-action",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const inspectionId = parseObjectIdParam(req.params.id, "inspection");
    const findingId = parseObjectIdParam(req.params.findingId, "finding");

    if (!canConductInspections(viewer.ikoshRole)) {
      throw new HttpError(
        403,
        "You are not permitted to raise corrective actions from inspections.",
      );
    }

    const parsed = linkFindingCorrectiveActionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const outcome = await runAuditedMutation(viewer._id, async (session) => {
      const inspection = await Inspection.findById(inspectionId).session(
        session,
      );

      if (!inspection) {
        throw new HttpError(404, "Inspection not found.");
      }

      const isManagement = isHseManagementRole(viewer.ikoshRole);
      const isInspector =
        String(inspection.inspector) === String(viewer._id);

      if (!isManagement && !isInspector) {
        throw new HttpError(
          403,
          "Only the assigned inspector or HSE management can raise corrective actions.",
        );
      }

      if (inspection.status === "CANCELLED") {
        throw new HttpError(
          409,
          "Corrective actions cannot be raised from a cancelled inspection.",
        );
      }

      const finding = findFinding(inspection, findingId);

      if (!finding) {
        throw new HttpError(404, "Finding not found.");
      }

      if (finding.correctiveAction) {
        throw new HttpError(
          409,
          "This finding is already linked to a corrective action.",
        );
      }

      await assertAssignableActionOwner(parsed.data.assignedTo, session);

      const created = new CorrectiveAction({
        description: parsed.data.description ?? finding.description,
        source: "INSPECTION",
        incident: null,
        inspection: inspection._id,
        findingId: finding._id,
        project: inspection.project,
        site: inspection.site,
        assignedTo: new Types.ObjectId(parsed.data.assignedTo),
        dueDate: parsed.data.dueDate,
        status: "OPEN",
        createdBy: viewer._id,
      });

      await created.save({ session });

      finding.correctiveAction = created._id;

      await inspection.save({ session });

      return {
        result: { inspection, correctiveAction: created },
        audit: {
          action: "inspection.finding_linked",
          entityType: "Inspection",
          entityId: inspection._id,
          after: inspectionAuditSnapshot(inspection),
        },
        additionalAudits: [
          {
            action: "corrective_action.created",
            entityType: "CorrectiveAction",
            entityId: created._id,
            after: correctiveActionAuditSnapshot(created),
          },
        ],
      };
    });

    await outcome.inspection.populate(INSPECTION_DETAIL_POPULATE);
    await outcome.correctiveAction.populate(CORRECTIVE_ACTION_POPULATE);

    res.status(201).json({
      success: true,
      inspection: toInspectionSummary(outcome.inspection),
      correctiveAction: toCorrectiveActionSummary(outcome.correctiveAction),
    });
  },
);

export default router;
