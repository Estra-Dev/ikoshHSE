import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { Types, type ClientSession } from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  createCorrectiveActionSchema,
  updateCorrectiveActionSchema,
  updateCorrectiveActionStatusSchema,
} from "../lib/validation/corrective-action.js";
import {
  CORRECTIVE_ACTION_ASSIGNABLE_ROLES,
  canTransitionCorrectiveActionStatus,
  isCorrectiveActionAssignableRole,
  isCorrectiveActionSource,
  isCorrectiveActionStatus,
  type CorrectiveActionStatus,
} from "../lib/hse-constants.js";
import {
  canCreateCorrectiveActions,
  canProgressCorrectiveActions,
} from "../lib/hse-permissions.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertCorrectiveActionAccess,
  correctiveActionScopeFilter,
} from "../lib/corrective-action-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { correctiveActionAuditSnapshot } from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { Incident } from "../models/Incident.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { toCorrectiveActionSummary } from "../serializers/corrective-action.js";

const router: Router = Router();

const CORRECTIVE_ACTION_POPULATE = [
  { path: "incident", select: "type title" },
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "assignedTo", select: "firstName lastName" },
  { path: "completedBy", select: "firstName lastName" },
  { path: "verifiedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

// Every corrective action route requires an authenticated, active IKOSH
// employee. Ordinary employees have no access to the CAPA register at all.
router.use(requireAuth(digitAuth), attachIkoshUser);
router.use(
  requireIkoshRole("ADMIN", "HSE_MANAGER", "HSE_OFFICER", "SUPERVISOR"),
);

/** Only active HSE staff may own a corrective action. */
async function assertAssignableUser(
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

// Assignable HSE staff for the create/edit forms. Declared before `/:id` so
// the literal path is not captured as an identifier.
router.get("/assignees", async (_req: Request, res: Response): Promise<void> => {
  const users = await User.find({
    isActive: true,
    ikoshRole: { $in: [...CORRECTIVE_ACTION_ASSIGNABLE_ROLES] },
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

// Corrective action register. HSE management sees everything; other HSE roles
// see actions at their assigned sites or assigned directly to them.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const source =
    typeof req.query.source === "string" ? req.query.source : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const assignedTo =
    typeof req.query.assignedTo === "string" ? req.query.assignedTo : undefined;
  const overdue =
    typeof req.query.overdue === "string" ? req.query.overdue : undefined;

  if (status !== undefined && !isCorrectiveActionStatus(status)) {
    throw new HttpError(400, "Invalid corrective action status.");
  }

  if (source !== undefined && !isCorrectiveActionSource(source)) {
    throw new HttpError(400, "Invalid corrective action source.");
  }

  for (const [label, value] of [
    ["project", projectId],
    ["site", siteId],
    ["assignee", assignedTo],
  ] as const) {
    if (value !== undefined && !Types.ObjectId.isValid(value)) {
      throw new HttpError(400, `Invalid ${label} id.`);
    }
  }

  if (overdue !== undefined && overdue !== "true" && overdue !== "false") {
    throw new HttpError(400, "Invalid overdue filter.");
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const conditions: Record<string, unknown>[] = [];
  const scope = correctiveActionScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (source) conditions.push({ source });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });
  if (assignedTo) {
    conditions.push({ assignedTo: new Types.ObjectId(assignedTo) });
  }

  if (overdue === "true") {
    conditions.push({
      dueDate: { $lt: new Date() },
      status: { $nin: ["COMPLETED", "VERIFIED"] },
    });
  }

  const filter =
    conditions.length > 0 ? { $and: conditions } : ({} as Record<string, unknown>);

  const { page, limit, skip } = parsePagination(req.query);

  const [total, actions] = await Promise.all([
    CorrectiveAction.countDocuments(filter),
    CorrectiveAction.find(filter)
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(CORRECTIVE_ACTION_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    correctiveActions: actions.map(toCorrectiveActionSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create a corrective action. Incident and near-miss sources derive project
// and site from the linked report; manual sources require a project.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateCorrectiveActions(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to create corrective actions.",
    );
  }

  const parsed = createCorrectiveActionSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const { description, source, assignedTo, dueDate } = parsed.data;

  const action = await runAuditedMutation(viewer._id, async (session) => {
    let incidentId: Types.ObjectId | null = null;
    let projectId: Types.ObjectId;
    let siteId: Types.ObjectId | null = null;

    if (source === "INCIDENT" || source === "NEAR_MISS") {
      const incidentIdValue = parsed.data.incidentId;

      if (!incidentIdValue) {
        throw new HttpError(400, "An incident is required for this source.");
      }

      const incident = await Incident.findById(incidentIdValue).session(
        session,
      );

      if (!incident) {
        throw new HttpError(404, "Specified incident was not found.");
      }

      if (incident.type !== source) {
        throw new HttpError(
          409,
          "Corrective action source does not match the linked incident type.",
        );
      }

      assertSiteAccess(viewer, incident.site);

      const incidentSite = await Site.findById(incident.site).session(session);

      if (!incidentSite) {
        throw new HttpError(409, "The linked incident site no longer exists.");
      }

      incidentId = incident._id;
      siteId = incidentSite._id;
      projectId = incidentSite.project;
    } else {
      const projectIdValue = parsed.data.projectId;

      if (!projectIdValue) {
        throw new HttpError(400, "A project is required for this source.");
      }

      const project = await Project.findById(projectIdValue).session(session);

      if (!project) {
        throw new HttpError(404, "Specified project was not found.");
      }

      projectId = project._id;

      if (parsed.data.siteId) {
        const site = await Site.findById(parsed.data.siteId).session(session);

        if (!site) {
          throw new HttpError(404, "Specified site was not found.");
        }

        if (String(site.project) !== String(projectId)) {
          throw new HttpError(
            409,
            "The selected site does not belong to the selected project.",
          );
        }

        assertSiteAccess(viewer, site._id);
        siteId = site._id;
      }
    }

    await assertAssignableUser(assignedTo, session);

    const created = new CorrectiveAction({
      description,
      source,
      incident: incidentId,
      project: projectId,
      site: siteId,
      assignedTo: new Types.ObjectId(assignedTo),
      dueDate,
      status: "OPEN",
      createdBy: viewer._id,
    });

    await created.save({ session });

    return {
      result: created,
      audit: {
        action: "corrective_action.created",
        entityType: "CorrectiveAction",
        entityId: created._id,
        after: correctiveActionAuditSnapshot(created),
      },
    };
  });

  await action.populate(CORRECTIVE_ACTION_POPULATE);

  res.status(201).json({
    success: true,
    correctiveAction: toCorrectiveActionSummary(action),
  });
});

// Read one corrective action. Out-of-scope actions return 404 so existence is
// not leaked to non-management users.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const actionId = parseObjectIdParam(req.params.id, "corrective action");

  const action = await CorrectiveAction.findById(actionId).populate(
    CORRECTIVE_ACTION_POPULATE,
  );

  if (!action) {
    throw new HttpError(404, "Corrective action not found.");
  }

  assertCorrectiveActionAccess(viewer, action);

  res.status(200).json({
    success: true,
    correctiveAction: toCorrectiveActionSummary(action),
  });
});

// Update metadata or reassign (HSE_MANAGER + ADMIN only). Verified actions are
// immutable; source and the linked incident are never editable.
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const actionId = parseObjectIdParam(req.params.id, "corrective action");

    const parsed = updateCorrectiveActionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const action = await runAuditedMutation(viewer._id, async (session) => {
      const action = await CorrectiveAction.findById(actionId).session(session);

      if (!action) {
        throw new HttpError(404, "Corrective action not found.");
      }

      if (action.status === "VERIFIED") {
        throw new HttpError(
          409,
          "Verified corrective actions cannot be edited.",
        );
      }

      const before = correctiveActionAuditSnapshot(action);
      const { description, projectId, siteId, assignedTo, dueDate } =
        parsed.data;

      // Incident-linked actions derive project and site from the report at
      // creation. Allowing either to move here would let provenance and
      // site-scoped visibility diverge from the linked incident.
      if (action.incident && (projectId !== undefined || siteId !== undefined)) {
        throw new HttpError(
          409,
          "Project and site are derived from the linked incident and cannot be changed.",
        );
      }

      let nextProject = action.project;

      if (projectId !== undefined) {
        const project = await Project.findById(projectId).session(session);

        if (!project) {
          throw new HttpError(404, "Specified project was not found.");
        }

        nextProject = project._id;
      }

      let nextSite = action.site;

      if (siteId !== undefined) {
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

      if (assignedTo !== undefined) {
        await assertAssignableUser(assignedTo, session);
        action.assignedTo = new Types.ObjectId(assignedTo);
      }

      if (description !== undefined) action.description = description;
      if (dueDate !== undefined) action.dueDate = dueDate;

      action.project = nextProject;
      action.site = nextSite;

      await action.save({ session });

      return {
        result: action,
        audit: {
          action: "corrective_action.updated",
          entityType: "CorrectiveAction",
          entityId: action._id,
          before,
          after: correctiveActionAuditSnapshot(action),
        },
      };
    });

    await action.populate(CORRECTIVE_ACTION_POPULATE);

    res.status(200).json({
      success: true,
      correctiveAction: toCorrectiveActionSummary(action),
    });
  },
);

// Progress or verify a corrective action. The assignee may move their own
// action forward; only HSE management may verify closure.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const actionId = parseObjectIdParam(req.params.id, "corrective action");

    const parsed = updateCorrectiveActionStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const nextStatus = parsed.data.status;

    const action = await runAuditedMutation(viewer._id, async (session) => {
      const action = await CorrectiveAction.findById(actionId).session(session);

      if (!action) {
        throw new HttpError(404, "Corrective action not found.");
      }

      if (!canProgressCorrectiveActions(viewer.ikoshRole)) {
        throw new HttpError(
          403,
          "You are not permitted to progress corrective actions.",
        );
      }

      const isManagement = isHseManagementRole(viewer.ikoshRole);
      const isAssignee =
        String(action.assignedTo) === String(viewer._id);

      if (!isManagement && !isAssignee) {
        throw new HttpError(
          403,
          "Only the assignee or HSE management can progress this action.",
        );
      }

      if (nextStatus === "VERIFIED" && !isManagement) {
        throw new HttpError(
          403,
          "Only HSE management can verify corrective action closure.",
        );
      }

      if (
        !canTransitionCorrectiveActionStatus(
          action.status as CorrectiveActionStatus,
          nextStatus,
        )
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${action.status} to ${nextStatus}.`,
        );
      }

      const before = correctiveActionAuditSnapshot(action);

      action.status = nextStatus;

      if (nextStatus === "COMPLETED") {
        action.completionNotes = parsed.data.completionNotes ?? null;
        action.completedAt = new Date();
        action.completedBy = viewer._id;
      }

      if (nextStatus === "VERIFIED") {
        action.verificationNotes = parsed.data.verificationNotes ?? null;
        action.verifiedAt = new Date();
        action.verifiedBy = viewer._id;
      }

      await action.save({ session });

      return {
        result: action,
        audit: {
          action: "corrective_action.status_changed",
          entityType: "CorrectiveAction",
          entityId: action._id,
          before,
          after: correctiveActionAuditSnapshot(action),
        },
      };
    });

    await action.populate(CORRECTIVE_ACTION_POPULATE);

    res.status(200).json({
      success: true,
      correctiveAction: toCorrectiveActionSummary(action),
    });
  },
);

export default router;
