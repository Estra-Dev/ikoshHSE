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
  createRiskAssessmentSchema,
  updateRiskAssessmentSchema,
  updateRiskAssessmentStatusSchema,
  type RiskHazardInput,
} from "../lib/validation/risk-assessment.js";
import {
  canTransitionRiskAssessmentStatus,
  isRiskAssessmentStatus,
  isRiskResponsibleRole,
  riskLevelFor,
  RISK_RESPONSIBLE_ROLES,
  type RiskAssessmentStatus,
} from "../lib/hse-constants.js";
import {
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
import { runAuditedMutation } from "../lib/audit-log.js";
import { riskAssessmentAuditSnapshot } from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { Project } from "../models/Project.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { toRiskAssessmentSummary } from "../serializers/risk-assessment.js";

const router: Router = Router();

const RISK_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "owner", select: "firstName lastName" },
  { path: "submittedBy", select: "firstName lastName" },
  { path: "approvedBy", select: "firstName lastName" },
  { path: "archivedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
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

/** Server-derived hazard rows, so stored risk bands always match the scores. */
function hazardDocuments(hazards: readonly RiskHazardInput[]) {
  return hazards.map((hazard) => ({
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
  }));
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

      const created = new RiskAssessment({
        title,
        description: description ?? "",
        status: "DRAFT",
        project: resolved.project,
        site: resolved.site,
        owner: new Types.ObjectId(ownerId),
        reviewDate: reviewDate ?? null,
        hazards: hazardDocuments(parsed.data.hazards),
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
    if (hazards !== undefined) {
      assessment.hazards = hazardDocuments(hazards) as typeof assessment.hazards;
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

        assessment.status = nextStatus;

        if (nextStatus === "IN_REVIEW") {
          assessment.submittedBy = viewer._id;
          assessment.submittedAt = new Date();
        }

        if (nextStatus === "APPROVED") {
          assessment.approvedBy = viewer._id;
          assessment.approvedAt = new Date();
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
