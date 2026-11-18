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
  createRiskAssessmentRevisionSchema,
  createRiskAssessmentSchema,
  createRiskTreatmentActionSchema,
  updateRiskAssessmentSchema,
  updateRiskAssessmentStatusSchema,
  type RiskHazardInput,
  type RiskTaskStepInput,
} from "../lib/validation/risk-assessment.js";
import {
  canTransitionRiskAssessmentStatus,
  isCorrectiveActionAssignableRole,
  isRiskAssessmentStatus,
  isRiskResponsibleRole,
  riskLevelFor,
  RISK_RESPONSIBLE_ROLES,
  type RiskAssessmentStatus,
} from "../lib/hse-constants.js";
import {
  canCreateCorrectiveActions,
  canCreateRiskAssessments,
  canEditRiskAssessments,
} from "../lib/hse-permissions.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertRiskAssessmentAccess,
  canEditRiskAssessment,
  canManageRiskAssessment,
  canSubmitRiskAssessment,
  riskAssessmentScopeFilter,
} from "../lib/risk-assessment-access.js";
import {
  runAuditedMutation,
  type AuditMutationDetails,
} from "../lib/audit-log.js";
import {
  correctiveActionAuditSnapshot,
  riskAssessmentAuditSnapshot,
} from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { Incident } from "../models/Incident.js";
import { Project } from "../models/Project.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { toCorrectiveActionSummary } from "../serializers/corrective-action.js";
import { toRiskAssessmentSummary } from "../serializers/risk-assessment.js";

const router: Router = Router();

const RISK_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "owner", select: "firstName lastName" },
  { path: "reviewTriggerIncident", select: "type title" },
  { path: "submittedBy", select: "firstName lastName" },
  { path: "approvedBy", select: "firstName lastName" },
  { path: "archivedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

const TREATMENT_ACTION_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "assignedTo", select: "firstName lastName" },
  { path: "riskAssessment", select: "title status revision" },
];

// Every risk route requires an authenticated, active IKOSH employee with at
// least read access to the register.
router.use(requireAuth(digitAuth), attachIkoshUser);
router.use(
  requireIkoshRole("ADMIN", "HSE_MANAGER", "HSE_OFFICER", "SUPERVISOR"),
);

/** Only active HSE personnel may own a risk assessment. */
async function assertAssignableOwner(
  ownerId: string,
  session: ClientSession,
): Promise<void> {
  const owner = await User.findById(ownerId).session(session);

  if (
    !owner ||
    !owner.isActive ||
    !isRiskResponsibleRole(owner.ikoshRole)
  ) {
    throw new HttpError(
      400,
      "Owner must be an active supervisor, HSE officer, manager or admin.",
    );
  }
}

/** Only active HSE staff may own a treatment action. */
async function assertAssignableTreatmentOwner(
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

interface PersistedTaskStep {
  _id: unknown;
  sequence: number;
  description: string;
}

/**
 * Normalises submitted task steps. Client-supplied ids are preserved so
 * hazards can reference a step within the same request; missing ids are
 * generated. Sequence is derived from array order so it is always unique.
 */
function taskStepDocuments(steps: readonly RiskTaskStepInput[]) {
  const seen = new Set<string>();

  return steps.map((step, index) => {
    const id = step.id ? new Types.ObjectId(step.id) : new Types.ObjectId();

    if (seen.has(String(id))) {
      throw new HttpError(400, "Task step ids must be unique.");
    }

    seen.add(String(id));

    return {
      _id: id,
      sequence: index,
      description: step.description,
    };
  });
}

/** Server-derived hazard rows, so stored risk bands always match the scores. */
function hazardDocuments(
  hazards: readonly RiskHazardInput[],
  taskSteps: readonly PersistedTaskStep[],
) {
  const stepIds = new Set(taskSteps.map((step) => String(step._id)));

  return hazards.map((hazard) => {
    let taskStepId: Types.ObjectId | null = null;

    if (hazard.taskStepId) {
      if (!stepIds.has(hazard.taskStepId)) {
        throw new HttpError(
          400,
          "A hazard references a task step that is not part of this assessment.",
        );
      }

      taskStepId = new Types.ObjectId(hazard.taskStepId);
    }

    return {
      hazard: hazard.hazard,
      consequences: hazard.consequences ?? "",
      existingControls: hazard.existingControls ?? "",
      likelihood: hazard.likelihood,
      severity: hazard.severity,
      inherentLevel: riskLevelFor(hazard.likelihood, hazard.severity),
      residualLikelihood: hazard.residualLikelihood,
      residualSeverity: hazard.residualSeverity,
      residualLevel: riskLevelFor(
        hazard.residualLikelihood,
        hazard.residualSeverity,
      ),
      additionalControls: hazard.additionalControls ?? "",
      taskStepId,
    };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Assignable owners for the assessment form. Declared before `/:id` so the
// literal path is not captured as an identifier.
router.get("/assignees", async (_req: Request, res: Response): Promise<void> => {
  const users = await User.find({
    isActive: true,
    ikoshRole: { $in: [...RISK_RESPONSIBLE_ROLES] },
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

// Risk assessment register. HSE management sees everything; supervisors and
// HSE officers see their sites plus assessments they own or created.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const ownerId =
    typeof req.query.ownerId === "string" ? req.query.ownerId : undefined;
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;

  if (status !== undefined && !isRiskAssessmentStatus(status)) {
    throw new HttpError(400, "Invalid risk assessment status.");
  }

  for (const [label, value] of [
    ["project", projectId],
    ["site", siteId],
    ["owner", ownerId],
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
  const scope = riskAssessmentScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });
  if (ownerId) conditions.push({ owner: new Types.ObjectId(ownerId) });

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

  const [total, assessments] = await Promise.all([
    RiskAssessment.countDocuments(filter),
    RiskAssessment.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(RISK_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    riskAssessments: assessments.map(toRiskAssessmentSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create a risk assessment in DRAFT. The project is mandatory; the site is
// optional but must belong to the project. Owners must be active HSE personnel.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateRiskAssessments(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to create risk assessments.",
    );
  }

  const parsed = createRiskAssessmentSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const { title, description, projectId, siteId, ownerId, reviewDate } =
    parsed.data;

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const assessment = await runAuditedMutation(
    viewer._id,
    async (session) => {
      const resolved = await resolveProjectAndSite(session, projectId, siteId);

      await assertAssignableOwner(ownerId, session);

      const taskSteps = taskStepDocuments(parsed.data.taskSteps ?? []);

      const created = new RiskAssessment({
        title,
        description: description ?? "",
        status: "DRAFT",
        project: resolved.project,
        site: resolved.site,
        owner: new Types.ObjectId(ownerId),
        reviewDate: reviewDate ?? null,
        hazards: hazardDocuments(parsed.data.hazards, taskSteps),
        taskSteps,
        createdBy: viewer._id,
      });

      await created.save({ session });

      return {
        result: created,
        audit: {
          action: "risk_assessment.created",
          entityType: "RiskAssessment",
          entityId: created._id,
          after: riskAssessmentAuditSnapshot(created),
        },
      };
    },
  );

  await assessment.populate(RISK_POPULATE);

  res.status(201).json({
    success: true,
    riskAssessment: toRiskAssessmentSummary(assessment),
  });
});

// Read one risk assessment. Out-of-scope assessments return 404 so existence
// is not leaked to non-management users.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const assessmentId = parseObjectIdParam(req.params.id, "risk assessment");

  const assessment = await RiskAssessment.findById(assessmentId).populate(
    RISK_POPULATE,
  );

  if (!assessment) {
    throw new HttpError(404, "Risk assessment not found.");
  }

  assertRiskAssessmentAccess(viewer, assessment);

  res.status(200).json({
    success: true,
    riskAssessment: toRiskAssessmentSummary(assessment),
  });
});

// Revision history for a controlled lineage. Access follows the assessment so
// out-of-scope users get the same 404 as the detail endpoint.
router.get(
  "/:id/revisions",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const assessmentId = parseObjectIdParam(req.params.id, "risk assessment");

    const assessment = await RiskAssessment.findById(assessmentId);

    if (!assessment) {
      throw new HttpError(404, "Risk assessment not found.");
    }

    assertRiskAssessmentAccess(viewer, assessment);

    const rootId = assessment.lineageId ?? assessment._id;
    const scope = riskAssessmentScopeFilter(viewer);
    const conditions: Record<string, unknown>[] = [
      { $or: [{ _id: rootId }, { lineageId: rootId }] },
    ];

    if (Object.keys(scope).length > 0) {
      conditions.push(scope);
    }

    const revisions = await RiskAssessment.find({ $and: conditions })
      .sort({ revision: 1, createdAt: 1 })
      .populate(RISK_POPULATE)
      .lean();

    res.status(200).json({
      success: true,
      riskAssessments: revisions.map(toRiskAssessmentSummary),
    });
  },
);

// Create a controlled revision of the current approved assessment. The source
// must still be current; approval of the new revision performs the atomic
// supersession. Content and hazard ids are cloned deliberately so treatment
// actions on older revisions remain distinct.
router.post(
  "/:id/revisions",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const assessmentId = parseObjectIdParam(req.params.id, "risk assessment");

    if (!canCreateRiskAssessments(viewer.ikoshRole)) {
      throw new HttpError(
        403,
        "You are not permitted to create risk assessment revisions.",
      );
    }

    const parsed = createRiskAssessmentRevisionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { reviewTrigger, incidentId, reviewDate } = parsed.data;

    const revision = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const source = await RiskAssessment.findById(assessmentId).session(
          session,
        );

        if (!source) {
          throw new HttpError(404, "Risk assessment not found.");
        }

        assertRiskAssessmentAccess(viewer, source);

        if (source.status !== "APPROVED" || source.supersededBy) {
          throw new HttpError(
            409,
            "Only the current approved risk assessment can be revised.",
          );
        }

        let triggerIncident: Types.ObjectId | null = null;

        if (incidentId) {
          const incident = await Incident.findById(incidentId).session(session);

          if (!incident) {
            throw new HttpError(404, "Specified incident was not found.");
          }

          const incidentSite = await Site.findById(incident.site).session(
            session,
          );

          if (!incidentSite) {
            throw new HttpError(
              409,
              "The linked incident site no longer exists.",
            );
          }

          if (
            String(incidentSite.project) !== String(source.project) ||
            (source.site !== null &&
              source.site !== undefined &&
              String(incidentSite._id) !== String(source.site))
          ) {
            throw new HttpError(
              409,
              "The linked incident does not match the assessment project and site.",
            );
          }

          triggerIncident = incident._id;
        }

        const stepIdMap = new Map<string, Types.ObjectId>();
        const taskSteps = (source.taskSteps ?? []).map((step, index) => {
          const id = new Types.ObjectId();
          stepIdMap.set(String(step._id), id);

          return {
            _id: id,
            sequence: index,
            description: step.description,
          };
        });

        const hazards = (source.hazards ?? []).map((hazard) => ({
          hazard: hazard.hazard,
          consequences: hazard.consequences ?? "",
          existingControls: hazard.existingControls ?? "",
          likelihood: hazard.likelihood,
          severity: hazard.severity,
          inherentLevel: hazard.inherentLevel,
          residualLikelihood: hazard.residualLikelihood,
          residualSeverity: hazard.residualSeverity,
          residualLevel: hazard.residualLevel,
          additionalControls: hazard.additionalControls ?? "",
          taskStepId: hazard.taskStepId
            ? (stepIdMap.get(String(hazard.taskStepId)) ?? null)
            : null,
        }));

        const created = new RiskAssessment({
          title: source.title,
          description: source.description ?? "",
          status: "DRAFT",
          project: source.project,
          site: source.site ?? null,
          owner: source.owner,
          reviewDate:
            reviewDate !== undefined ? reviewDate : (source.reviewDate ?? null),
          hazards,
          taskSteps,
          revision: (source.revision ?? 1) + 1,
          lineageId: source.lineageId ?? source._id,
          supersedes: source._id,
          reviewTrigger,
          reviewTriggerIncident: triggerIncident,
          createdBy: viewer._id,
        });

        await created.save({ session });

        return {
          result: created,
          audit: {
            action: "risk_assessment.revision_created",
            entityType: "RiskAssessment",
            entityId: created._id,
            after: riskAssessmentAuditSnapshot(created),
          },
        };
      },
    );

    await revision.populate(RISK_POPULATE);

    res.status(201).json({
      success: true,
      riskAssessment: toRiskAssessmentSummary(revision),
    });
  },
);

// Raise a treatment action from one hazard. Multiple independent actions are
// allowed per hazard and reuse the corrective action workflow.
router.post(
  "/:id/hazards/:hazardId/treatment-action",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const assessmentId = parseObjectIdParam(req.params.id, "risk assessment");
    const hazardId = parseObjectIdParam(req.params.hazardId, "hazard");

    if (!canCreateCorrectiveActions(viewer.ikoshRole)) {
      throw new HttpError(
        403,
        "You are not permitted to create corrective actions.",
      );
    }

    const parsed = createRiskTreatmentActionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const { description, assignedTo, dueDate } = parsed.data;

    const action = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const assessment = await RiskAssessment.findById(assessmentId).session(
          session,
        );

        if (!assessment) {
          throw new HttpError(404, "Risk assessment not found.");
        }

        assertRiskAssessmentAccess(viewer, assessment);

        if (assessment.status === "ARCHIVED") {
          throw new HttpError(
            409,
            "Treatment actions cannot be raised against an archived risk assessment.",
          );
        }

        const hazard = (assessment.hazards ?? []).find(
          (item) => String(item._id) === hazardId,
        );

        if (!hazard) {
          throw new HttpError(
            404,
            "Hazard not found in this risk assessment.",
          );
        }

        await assertAssignableTreatmentOwner(assignedTo, session);

        const created = new CorrectiveAction({
          description,
          source: "RISK_ASSESSMENT",
          riskAssessment: assessment._id,
          riskAssessmentHazardId: hazard._id,
          project: assessment.project,
          site: assessment.site ?? null,
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
          additionalAudits: [
            {
              action: "risk_assessment.treatment_action_raised",
              entityType: "RiskAssessment",
              entityId: assessment._id,
              after: {
                hazardId: String(hazard._id),
                correctiveActionId: String(created._id),
              },
            },
          ],
        };
      },
    );

    await action.populate(TREATMENT_ACTION_POPULATE);

    res.status(201).json({
      success: true,
      correctiveAction: toCorrectiveActionSummary(action),
    });
  },
);

// Edit DRAFT metadata or replace the hazard list. Approved and archived
// assessments are immutable except for archiving.
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const assessmentId = parseObjectIdParam(req.params.id, "risk assessment");

  if (!canEditRiskAssessments(viewer.ikoshRole)) {
    throw new HttpError(
      403,
      "You are not permitted to edit risk assessments.",
    );
  }

  const parsed = updateRiskAssessmentSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const assessment = await runAuditedMutation(viewer._id, async (session) => {
    const assessment = await RiskAssessment.findById(assessmentId).session(
      session,
    );

    if (!assessment) {
      throw new HttpError(404, "Risk assessment not found.");
    }

    if (assessment.status !== "DRAFT") {
      throw new HttpError(
        409,
        "Only draft risk assessments can be edited. Return the assessment to draft first.",
      );
    }

    if (!canEditRiskAssessment(viewer, assessment)) {
      throw new HttpError(
        403,
        "Only the assessment owner, creator or HSE management can edit this draft.",
      );
    }

    const before = riskAssessmentAuditSnapshot(assessment);
    const {
      title,
      description,
      projectId,
      siteId,
      ownerId,
      reviewDate,
      hazards,
      taskSteps,
    } = parsed.data;

    let nextProject = assessment.project;
    let nextSite = assessment.site;

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

    if (ownerId !== undefined) {
      await assertAssignableOwner(ownerId, session);
      assessment.owner = new Types.ObjectId(ownerId);
    }

    if (title !== undefined) assessment.title = title;
    if (description !== undefined) assessment.description = description;
    if (reviewDate !== undefined) assessment.reviewDate = reviewDate;

    const nextTaskSteps =
      taskSteps !== undefined
        ? taskStepDocuments(taskSteps)
        : (assessment.taskSteps ?? []);

    if (taskSteps !== undefined && hazards === undefined) {
      const nextStepIds = new Set(
        nextTaskSteps.map((step) => String(step._id)),
      );
      const referenced = (assessment.hazards ?? []).some(
        (hazard) =>
          hazard.taskStepId &&
          !nextStepIds.has(String(hazard.taskStepId)),
      );

      if (referenced) {
        throw new HttpError(
          409,
          "A task step cannot be removed while a hazard still references it.",
        );
      }
    }

    if (hazards !== undefined) {
      assessment.hazards = hazardDocuments(
        hazards,
        nextTaskSteps,
      ) as typeof assessment.hazards;
    }

    if (taskSteps !== undefined) {
      assessment.taskSteps =
        nextTaskSteps as typeof assessment.taskSteps;
    }

    assessment.project = nextProject;
    assessment.site = nextSite;

    await assessment.save({ session });

    return {
      result: assessment,
      audit: {
        action: "risk_assessment.updated",
        entityType: "RiskAssessment",
        entityId: assessment._id,
        before,
        after: riskAssessmentAuditSnapshot(assessment),
      },
    };
  });

  await assessment.populate(RISK_POPULATE);

  res.status(200).json({
    success: true,
    riskAssessment: toRiskAssessmentSummary(assessment),
  });
});

// Progress the workflow. Authors submit for review; HSE management approves,
// returns to draft or archives. ARCHIVED is terminal.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const assessmentId = parseObjectIdParam(
      req.params.id,
      "risk assessment",
    );

    const parsed = updateRiskAssessmentStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const nextStatus = parsed.data.status;

    const assessment = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const assessment = await RiskAssessment.findById(assessmentId).session(
          session,
        );

        if (!assessment) {
          throw new HttpError(404, "Risk assessment not found.");
        }

        if (
          !canTransitionRiskAssessmentStatus(
            assessment.status as RiskAssessmentStatus,
            nextStatus,
          )
        ) {
          throw new HttpError(
            409,
            `Invalid status transition from ${assessment.status} to ${nextStatus}.`,
          );
        }

        if (nextStatus === "IN_REVIEW") {
          if (!canSubmitRiskAssessment(viewer, assessment)) {
            throw new HttpError(
              403,
              "Only the assessment owner, creator or HSE management can submit it for review.",
            );
          }
        } else if (!canManageRiskAssessment(viewer)) {
          throw new HttpError(
            403,
            "Only HSE management can approve, return or archive risk assessments.",
          );
        }

        const before = riskAssessmentAuditSnapshot(assessment);
        let supersessionAudit: AuditMutationDetails | null = null;

        assessment.status = nextStatus;

        if (nextStatus === "IN_REVIEW") {
          assessment.submittedBy = viewer._id;
          assessment.submittedAt = new Date();
        }

        if (nextStatus === "APPROVED") {
          assessment.approvedBy = viewer._id;
          assessment.approvedAt = new Date();

          // Atomic supersession: only one revision may retire the source. The
          // conditional update also rejects a stale revision whose source has
          // already been superseded by a competing approval.
          if (assessment.supersedes) {
            const previous = await RiskAssessment.findOneAndUpdate(
              {
                _id: assessment.supersedes,
                status: "APPROVED",
                supersededBy: null,
              },
              {
                $set: {
                  supersededBy: assessment._id,
                  supersededAt: new Date(),
                },
              },
              { session, returnDocument: "before" },
            );

            if (!previous) {
              throw new HttpError(
                409,
                "This revision can no longer be approved because its source assessment is no longer the current approved revision.",
              );
            }

            const superseded = await RiskAssessment.findById(
              assessment.supersedes,
            ).session(session);

            supersessionAudit = {
              action: "risk_assessment.superseded",
              entityType: "RiskAssessment",
              entityId: previous._id,
              before: riskAssessmentAuditSnapshot(previous),
              after: superseded
                ? riskAssessmentAuditSnapshot(superseded)
                : null,
            };
          }
        }

        if (nextStatus === "DRAFT") {
          // Returning for changes discards the stale approval/submission trail
          // so the next review starts from a clean state.
          assessment.submittedBy = null;
          assessment.submittedAt = null;
          assessment.approvedBy = null;
          assessment.approvedAt = null;
        }

        if (nextStatus === "ARCHIVED") {
          assessment.archivedBy = viewer._id;
          assessment.archivedAt = new Date();
        }

        await assessment.save({ session });

        return {
          result: assessment,
          audit: {
            action: "risk_assessment.status_changed",
            entityType: "RiskAssessment",
            entityId: assessment._id,
            before,
            after: riskAssessmentAuditSnapshot(assessment),
          },
          ...(supersessionAudit
            ? { additionalAudits: [supersessionAudit] }
            : {}),
        };
      },
    );

    await assessment.populate(RISK_POPULATE);

    res.status(200).json({
      success: true,
      riskAssessment: toRiskAssessmentSummary(assessment),
    });
  },
);

export default router;
