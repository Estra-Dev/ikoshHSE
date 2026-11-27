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
  createManagementOfChangeSchema,
  managementOfChangeApprovalSchema,
  managementOfChangeListQuerySchema,
  updateManagementOfChangeAssessmentSchema,
  updateManagementOfChangeImplementationSchema,
  updateManagementOfChangeVerificationSchema,
} from "../lib/validation/management-of-change.js";
import {
  canApproveManagementOfChangeManagement,
  canApproveManagementOfChangeTechnical,
  canAssessManagementOfChange,
  canCreateManagementOfChange,
  canImplementManagementOfChange,
  canManageManagementOfChange,
  canVerifyManagementOfChange,
  canViewManagementOfChange,
} from "../lib/hse-permissions.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertManagementOfChangeAccess,
  managementOfChangeScopeFilter,
} from "../lib/management-of-change-access.js";
import {
  assertManagementOfChangeApprovalAllowed,
  deriveManagementOfChangeApprovalStatus,
  managementOfChangeApprovalAuditAction,
  managementOfChangeApprovalAuthorityBasis,
  type ManagementOfChangeApprovalStage,
} from "../lib/management-of-change-approval.js";
import {
  getManagementOfChangeApprovalPolicy,
  hasRequiredManagementOfChangeApprovals,
  isManagementOfChangeApprovalEnabled,
} from "../lib/management-of-change-policy.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { managementOfChangeAuditSnapshot } from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { AuditLog } from "../models/AuditLog.js";
import { ManagementOfChange } from "../models/ManagementOfChange.js";
import { Project } from "../models/Project.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { Site } from "../models/Site.js";
import { toAuditLogSummary } from "../serializers/audit-log.js";
import { toManagementOfChangeSummary } from "../serializers/management-of-change.js";

const router: Router = Router();

const MOC_POPULATE = [
  { path: "project", select: "name code" },
  { path: "site", select: "name code" },
  { path: "changeOwner", select: "firstName lastName email" },
  { path: "submittedBy", select: "firstName lastName email" },
  { path: "createdBy", select: "firstName lastName email" },
  {
    path: "impactAssessment.riskAssessment",
    select: "title status revision",
  },
  { path: "approvals.approver", select: "firstName lastName email" },
  { path: "verification.verifiedBy", select: "firstName lastName email" },
  { path: "closedBy", select: "firstName lastName email" },
];

router.use(requireAuth(digitAuth), attachIkoshUser);
router.use(
  requireIkoshRole("ADMIN", "HSE_MANAGER", "HSE_OFFICER", "SUPERVISOR"),
);

function assertPermission(allowed: boolean): void {
  if (!allowed) {
    throw new HttpError(
      403,
      "You do not have permission to perform this action.",
    );
  }
}

/**
 * Reference numbers are derived from the document's own ObjectId, so they are
 * unique by construction as well as by the model's unique index.
 */
function referenceFor(id: Types.ObjectId): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `MOC-${date}-${id.toHexString().toUpperCase()}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assessmentComplete(assessment: {
  qhseRisks?: string | null;
  environmentalAspects?: string | null;
  legalAndClientObligations?: string | null;
  competenceRequirements?: string | null;
  procedureChanges?: string | null;
  emergencyArrangements?: string | null;
  interfaces?: string | null;
} | null | undefined): boolean {
  return Boolean(
    assessment?.qhseRisks?.trim() &&
      assessment.environmentalAspects?.trim() &&
      assessment.legalAndClientObligations?.trim() &&
      assessment.competenceRequirements?.trim() &&
      assessment.procedureChanges?.trim() &&
      assessment.emergencyArrangements?.trim() &&
      assessment.interfaces?.trim(),
  );
}

async function findChangeOrThrow(
  req: Request,
  viewer: ReturnType<typeof getIkoshUser>,
) {
  const id = parseObjectIdParam(req.params.id, "change request");
  const item = await ManagementOfChange.findById(id);

  if (!item) {
    throw new HttpError(404, "Change request not found.");
  }

  assertManagementOfChangeAccess(viewer, item);
  return item;
}

// Register. HSE management sees every record; supervisors and HSE officers
// see their assigned sites plus records they own or created.
router.get("/", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canViewManagementOfChange(viewer.ikoshRole));

  const parsed = managementOfChangeListQuerySchema.safeParse({
    status: req.query.status,
    projectId: req.query.projectId,
    siteId: req.query.siteId,
    q: req.query.q,
  });

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const { status, projectId, siteId } = parsed.data;
  const search = parsed.data.q?.trim();

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const conditions: Record<string, unknown>[] = [];
  const scope = managementOfChangeScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (projectId) {
    conditions.push({ project: new Types.ObjectId(projectId) });
  }
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    conditions.push({
      $or: [
        { reference: pattern },
        { title: pattern },
        { reason: pattern },
      ],
    });
  }

  const filter =
    conditions.length > 0
      ? { $and: conditions }
      : ({} as Record<string, unknown>);

  const { page, limit, skip } = parsePagination(req.query);

  const [items, total] = await Promise.all([
    ManagementOfChange.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(MOC_POPULATE)
      .lean(),
    ManagementOfChange.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    items: items.map(toManagementOfChangeSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

// Create a change request in DRAFT. Creating a record never authorises the
// change itself.
router.post("/", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canCreateManagementOfChange(viewer.ikoshRole));

  const parsed = createManagementOfChangeSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const input = parsed.data;
  const project = await Project.findById(input.project).lean();

  if (!project) {
    throw new HttpError(404, "Project not found.");
  }

  if (input.site) {
    const site = await Site.findOne({
      _id: input.site,
      project: input.project,
    }).lean();

    if (!site) {
      throw new HttpError(400, "Site does not belong to this project.");
    }

    assertSiteAccess(viewer, site._id);
  }

  const id = new Types.ObjectId();

  const created = await runAuditedMutation(viewer._id, async (session) => {
    const [change] = await ManagementOfChange.create(
      [
        {
          _id: id,
          reference: referenceFor(id),
          title: input.title,
          reason: input.reason,
          scope: input.scope,
          changeType: input.changeType,
          plannedStartAt: input.plannedStartAt
            ? new Date(input.plannedStartAt)
            : null,
          plannedEndAt: input.plannedEndAt
            ? new Date(input.plannedEndAt)
            : null,
          affectedAssets: input.affectedAssets,
          affectedPeople: input.affectedPeople,
          project: new Types.ObjectId(input.project),
          site: input.site ? new Types.ObjectId(input.site) : null,
          changeOwner: viewer._id,
          createdBy: viewer._id,
          status: "DRAFT",
        },
      ],
      { session },
    );

    if (!change) {
      throw new Error("Unable to create change request.");
    }

    return {
      result: change,
      audit: {
        action: "management_of_change.created",
        entityType: "ManagementOfChange",
        entityId: change._id,
        after: managementOfChangeAuditSnapshot(change),
      },
    };
  });

  await created.populate(MOC_POPULATE);

  res.status(201).json({
    success: true,
    item: toManagementOfChangeSummary(created),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

// Record-level audit history. This is narrower than the global audit log and
// is available to anyone who can read the change request.
router.get("/:id/history", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canViewManagementOfChange(viewer.ikoshRole));

  const id = parseObjectIdParam(req.params.id, "change request");
  const item = await ManagementOfChange.findById(id)
    .select("project site changeOwner createdBy")
    .lean();

  if (!item) {
    throw new HttpError(404, "Change request not found.");
  }

  assertManagementOfChangeAccess(viewer, item);

  const history = await AuditLog.find({
    entityType: "ManagementOfChange",
    entityId: new Types.ObjectId(id),
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.status(200).json({
    success: true,
    data: { history: history.map(toAuditLogSummary) },
  });
});

// Read one change request.
router.get("/:id", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canViewManagementOfChange(viewer.ikoshRole));

  const id = parseObjectIdParam(req.params.id, "change request");
  const item = await ManagementOfChange.findById(id)
    .populate(MOC_POPULATE)
    .lean();

  if (!item) {
    throw new HttpError(404, "Change request not found.");
  }

  assertManagementOfChangeAccess(viewer, item);

  res.status(200).json({
    success: true,
    item: toManagementOfChangeSummary(item),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

// Create or update the impact/risk assessment. Only DRAFT and ASSESSMENT
// records may be assessed, and the status is always server-derived.
router.patch("/:id/assessment", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canAssessManagementOfChange(viewer.ikoshRole));

  const parsed = updateManagementOfChangeAssessmentSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const item = await findChangeOrThrow(req, viewer);

  if (item.status !== "DRAFT" && item.status !== "ASSESSMENT") {
    throw new HttpError(
      409,
      "Impact assessment cannot be changed at this stage.",
    );
  }

  let riskAssessmentId = item.impactAssessment?.riskAssessment ?? null;

  if (parsed.data.riskAssessment !== undefined) {
    riskAssessmentId = parsed.data.riskAssessment
      ? new Types.ObjectId(parsed.data.riskAssessment)
      : null;
  }

  if (riskAssessmentId) {
    const riskAssessment = await RiskAssessment.findById(
      riskAssessmentId,
    ).lean();

    if (!riskAssessment) {
      throw new HttpError(404, "Linked risk assessment not found.");
    }

    if (String(riskAssessment.project) !== String(item.project)) {
      throw new HttpError(
        409,
        "The linked risk assessment belongs to a different project.",
      );
    }

    if (
      item.site &&
      riskAssessment.site &&
      String(riskAssessment.site) !== String(item.site)
    ) {
      throw new HttpError(
        409,
        "The linked risk assessment belongs to a different site.",
      );
    }
  }

  const before = managementOfChangeAuditSnapshot(item);

  const updated = await runAuditedMutation(viewer._id, async (session) => {
    item.impactAssessment = {
      qhseRisks: parsed.data.qhseRisks,
      environmentalAspects: parsed.data.environmentalAspects,
      legalAndClientObligations: parsed.data.legalAndClientObligations,
      competenceRequirements: parsed.data.competenceRequirements,
      procedureChanges: parsed.data.procedureChanges,
      emergencyArrangements: parsed.data.emergencyArrangements,
      interfaces: parsed.data.interfaces,
      riskAssessment: riskAssessmentId,
    };
    item.status = "ASSESSMENT";

    await item.save({ session });

    return {
      result: item,
      audit: {
        action: "management_of_change.assessment_updated",
        entityType: "ManagementOfChange",
        entityId: item._id,
        before,
        after: managementOfChangeAuditSnapshot(item),
      },
    };
  });

  await updated.populate(MOC_POPULATE);

  res.status(200).json({
    success: true,
    item: toManagementOfChangeSummary(updated),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

// Submission is the first A03 control point. It is available only after a
// complete assessment and only when the draft SOP has been formally activated.
router.post("/:id/submit", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canManageManagementOfChange(viewer.ikoshRole));

  const id = parseObjectIdParam(req.params.id, "change request");

  const updated = await runAuditedMutation(viewer._id, async (session) => {
    const item = await ManagementOfChange.findById(id).session(session);

    if (!item) {
      throw new HttpError(404, "Change request not found.");
    }

    assertManagementOfChangeAccess(viewer, item);

    if (!isManagementOfChangeApprovalEnabled()) {
      throw new HttpError(
        409,
        getManagementOfChangeApprovalPolicy().message,
      );
    }

    if (item.status !== "ASSESSMENT") {
      throw new HttpError(
        409,
        "Complete the impact assessment before submission.",
      );
    }

    if (!assessmentComplete(item.impactAssessment)) {
      throw new HttpError(
        400,
        "Complete all impact assessment sections before submission.",
      );
    }

    const before = managementOfChangeAuditSnapshot(item);

    item.submittedBy = viewer._id;
    item.submittedAt = new Date();
    item.status = "PENDING_APPROVAL";

    await item.save({ session });

    return {
      result: item,
      audit: {
        action: "management_of_change.submitted",
        entityType: "ManagementOfChange",
        entityId: item._id,
        before,
        after: managementOfChangeAuditSnapshot(item),
      },
    };
  });

  await updated.populate(MOC_POPULATE);

  res.status(200).json({
    success: true,
    item: toManagementOfChangeSummary(updated),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

async function recordApproval(
  req: Request,
  res: Response,
  stage: ManagementOfChangeApprovalStage,
) {
  const viewer = getIkoshUser(req);
  assertPermission(
    stage === "TECHNICAL"
      ? canApproveManagementOfChangeTechnical(viewer.ikoshRole)
      : canApproveManagementOfChangeManagement(viewer.ikoshRole),
  );

  const parsed = managementOfChangeApprovalSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const id = parseObjectIdParam(req.params.id, "change request");

  const updated = await runAuditedMutation(viewer._id, async (session) => {
    const item = await ManagementOfChange.findById(id).session(session);

    if (!item) {
      throw new HttpError(404, "Change request not found.");
    }

    assertManagementOfChangeAccess(viewer, item);
    assertManagementOfChangeApprovalAllowed(viewer, item, stage);

    const before = managementOfChangeAuditSnapshot(item);

    item.approvals.push({
      approvalType: stage,
      approver: viewer._id,
      authorityBasis: managementOfChangeApprovalAuthorityBasis(stage),
      decision: parsed.data.decision,
      comments: parsed.data.comments,
      decidedAt: new Date(),
    } as unknown as (typeof item.approvals)[number]);
    item.status = deriveManagementOfChangeApprovalStatus(item);

    await item.save({ session });

    return {
      result: item,
      audit: {
        action: managementOfChangeApprovalAuditAction(
          stage,
          parsed.data.decision,
        ),
        entityType: "ManagementOfChange",
        entityId: item._id,
        before,
        after: managementOfChangeAuditSnapshot(item),
      },
    };
  });

  await updated.populate(MOC_POPULATE);

  res.status(200).json({
    success: true,
    item: toManagementOfChangeSummary(updated),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
}

// HSE managers record the technical/HSE stage. Administrators cannot record
// this stage, and no approver may approve their own change request.
router.post("/:id/approvals/technical", async (req: Request, res: Response) => {
  await recordApproval(req, res, "TECHNICAL");
});

// Administrators record the management stage only after technical approval.
router.post(
  "/:id/approvals/management",
  async (req: Request, res: Response) => {
    await recordApproval(req, res, "MANAGEMENT");
  },
);

// Implementation plan and briefing. Implementation is impossible without
// A03 activation and both recorded approval stages.
router.patch("/:id/implementation", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canImplementManagementOfChange(viewer.ikoshRole));

  const parsed = updateManagementOfChangeImplementationSchema.safeParse(
    req.body,
  );

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const item = await findChangeOrThrow(req, viewer);

  if (item.status !== "APPROVED" && item.status !== "IMPLEMENTING") {
    throw new HttpError(409, "Implementation requires an approved change.");
  }

  if (!hasRequiredManagementOfChangeApprovals(item)) {
    throw new HttpError(
      409,
      "Implementation is blocked until A03 is activated and both technical and management approvals are recorded without a rejection.",
    );
  }

  const before = managementOfChangeAuditSnapshot(item);

  const updated = await runAuditedMutation(viewer._id, async (session) => {
    item.implementationPlan = {
      controls: parsed.data.controls,
      testingPlan: parsed.data.testingPlan,
      communicationPlan: parsed.data.communicationPlan,
      rollbackPlan: parsed.data.rollbackPlan,
      updatedDocuments: parsed.data.updatedDocuments,
      briefingCompleted: parsed.data.briefingCompleted,
      briefingAt: parsed.data.briefingCompleted ? new Date() : null,
    };
    item.status = "IMPLEMENTING";

    await item.save({ session });

    return {
      result: item,
      audit: {
        action: "management_of_change.implementation_updated",
        entityType: "ManagementOfChange",
        entityId: item._id,
        before,
        after: managementOfChangeAuditSnapshot(item),
      },
    };
  });

  await updated.populate(MOC_POPULATE);

  res.status(200).json({
    success: true,
    item: toManagementOfChangeSummary(updated),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

// Verification may only follow implementation, which itself requires the
// blocked approvals above.
router.patch("/:id/verification", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canVerifyManagementOfChange(viewer.ikoshRole));

  const parsed = updateManagementOfChangeVerificationSchema.safeParse(
    req.body,
  );

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const item = await findChangeOrThrow(req, viewer);

  if (item.status !== "IMPLEMENTING" && item.status !== "VERIFICATION") {
    throw new HttpError(
      409,
      "Change must be implemented before verification.",
    );
  }

  if (!hasRequiredManagementOfChangeApprovals(item)) {
    throw new HttpError(
      409,
      "Verification is blocked until A03 is activated and both technical and management approvals are recorded.",
    );
  }

  const before = managementOfChangeAuditSnapshot(item);

  const updated = await runAuditedMutation(viewer._id, async (session) => {
    item.verification = {
      findings: parsed.data.findings,
      testingCompleted: parsed.data.testingCompleted,
      inspectionCompleted: parsed.data.inspectionCompleted,
      actionsClosed: parsed.data.actionsClosed,
      verifiedBy: viewer._id,
      verifiedAt: new Date(),
    };
    item.status = "VERIFICATION";

    await item.save({ session });

    return {
      result: item,
      audit: {
        action: "management_of_change.verification_updated",
        entityType: "ManagementOfChange",
        entityId: item._id,
        before,
        after: managementOfChangeAuditSnapshot(item),
      },
    };
  });

  await updated.populate(MOC_POPULATE);

  res.status(200).json({
    success: true,
    item: toManagementOfChangeSummary(updated),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

// Close only after verification requirements are complete.
router.post("/:id/close", async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  assertPermission(canManageManagementOfChange(viewer.ikoshRole));

  const item = await findChangeOrThrow(req, viewer);

  if (
    item.status !== "VERIFICATION" ||
    !item.verification?.testingCompleted ||
    !item.verification.inspectionCompleted ||
    !item.verification.actionsClosed
  ) {
    throw new HttpError(
      409,
      "Complete verification, inspection and action closeout before closure.",
    );
  }

  if (!hasRequiredManagementOfChangeApprovals(item)) {
    throw new HttpError(
      409,
      "Closure is blocked until A03 is activated and both technical and management approvals are recorded.",
    );
  }

  const before = managementOfChangeAuditSnapshot(item);

  const updated = await runAuditedMutation(viewer._id, async (session) => {
    item.status = "CLOSED";
    item.closedBy = viewer._id;
    item.closedAt = new Date();

    await item.save({ session });

    return {
      result: item,
      audit: {
        action: "management_of_change.closed",
        entityType: "ManagementOfChange",
        entityId: item._id,
        before,
        after: managementOfChangeAuditSnapshot(item),
      },
    };
  });

  await updated.populate(MOC_POPULATE);

  res.status(200).json({
    success: true,
    item: toManagementOfChangeSummary(updated),
    approvalPolicy: getManagementOfChangeApprovalPolicy(),
  });
});

export default router;
