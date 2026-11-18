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
  createPermitSchema,
  updatePermitSchema,
  updatePermitStatusSchema,
} from "../lib/validation/permit.js";
import {
  canTransitionPermitStatus,
  isPermitResponsibleRole,
  isPermitStatus,
  isPermitToWorkType,
  PERMIT_RESPONSIBLE_ROLES,
  type PermitStatus,
} from "../lib/hse-constants.js";
import {
  canCreatePermits,
} from "../lib/hse-permissions.js";
import { activePermitPolicyVersion } from "../lib/permit-readiness.js";
import {
  assertSiteAccess,
  isSiteAssigned,
} from "../lib/site-access.js";
import {
  assertPermitAccess,
  canActivatePermit,
  canApprovePermit,
  canCancelPermit,
  canClosePermit,
  canEditPermit,
  canResumePermit,
  canSubmitPermit,
  canSuspendPermit,
  permitScopeFilter,
} from "../lib/permit-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { permitAuditSnapshot } from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { Permit } from "../models/Permit.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { toPermitSummary } from "../serializers/permit.js";

const router: Router = Router();

const PERMIT_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "responsiblePerson", select: "firstName lastName" },
  { path: "submittedBy", select: "firstName lastName" },
  { path: "approvedBy", select: "firstName lastName" },
  { path: "rejectedBy", select: "firstName lastName" },
  { path: "activatedBy", select: "firstName lastName" },
  { path: "suspendedBy", select: "firstName lastName" },
  { path: "resumedBy", select: "firstName lastName" },
  { path: "cancelledBy", select: "firstName lastName" },
  { path: "closedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

// Every permit route requires an authenticated, active IKOSH employee with at
// least read access to the register.
router.use(requireAuth(digitAuth), attachIkoshUser);
router.use(
  requireIkoshRole("ADMIN", "HSE_MANAGER", "HSE_OFFICER", "SUPERVISOR"),
);

/**
 * Resolves and validates the project/site pair. Permits are always site-bound:
 * the site must exist, be active and belong to the selected project.
 */
async function resolvePermitProjectAndSite(
  session: ClientSession,
  projectId: string,
  siteId: string,
): Promise<{
  project: Types.ObjectId;
  site: Types.ObjectId;
}> {
  const project = await Project.findById(projectId).session(session);

  if (!project) {
    throw new HttpError(404, "Specified project was not found.");
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

  if (site.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "Permits can only be raised against an active site.",
    );
  }

  return { project: project._id, site: site._id };
}

/**
 * The responsible person must be an active employee with a permit-eligible
 * IKOSH role and access to the permit's site. HSE management is site-wide;
 * everyone else needs an explicit site assignment.
 */
async function assertPermitResponsiblePerson(
  personId: string,
  siteId: unknown,
  session: ClientSession,
): Promise<void> {
  const person = await User.findById(personId).session(session);

  if (
    !person ||
    !person.isActive ||
    !isPermitResponsibleRole(person.ikoshRole)
  ) {
    throw new HttpError(
      400,
      "Responsible person must be an active supervisor, HSE officer, manager or admin.",
    );
  }

  if (!isSiteAssigned(person, siteId)) {
    throw new HttpError(
      400,
      "Responsible person is not authorised for the selected site.",
    );
  }
}

/**
 * Site and responsible-person checks repeated at approval and activation so a
 * permit cannot start work after the site was closed or the responsible person
 * became inactive or lost site access.
 */
async function assertPermitReadyForWork(
  permit: { site: unknown; responsiblePerson: unknown },
  session: ClientSession,
): Promise<void> {
  const site = await Site.findById(permit.site).session(session);

  if (!site) {
    throw new HttpError(409, "The permit's site no longer exists.");
  }

  if (site.status !== "ACTIVE") {
    throw new HttpError(
      409,
      "The permit's site is no longer active, so work cannot start.",
    );
  }

  await assertPermitResponsiblePerson(
    String(permit.responsiblePerson),
    site._id,
    session,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWithinValidity(
  permit: { validFrom: Date; validTo: Date },
  now: number,
): boolean {
  return (
    now >= permit.validFrom.getTime() && now <= permit.validTo.getTime()
  );
}

// Eligible responsible people for the permit form. When a site is supplied,
// only people authorised for that site are returned so the client cannot offer
// an assignment the API will reject.
router.get("/assignees", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;

  if (siteId !== undefined && !Types.ObjectId.isValid(siteId)) {
    throw new HttpError(400, "Invalid site id.");
  }

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const filter: Record<string, unknown> = {
    isActive: true,
    ikoshRole: { $in: [...PERMIT_RESPONSIBLE_ROLES] },
  };

  if (siteId) {
    filter.$or = [
      { ikoshRole: { $in: ["HSE_MANAGER", "ADMIN"] } },
      { assignedSites: new Types.ObjectId(siteId) },
    ];
  }

  const users = await User.find(filter)
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

// Permit register. HSE management sees everything; other HSE roles see permits
// at their assigned sites plus permits they created or are responsible for.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const workType =
    typeof req.query.workType === "string" ? req.query.workType : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const responsiblePersonId =
    typeof req.query.responsiblePersonId === "string"
      ? req.query.responsiblePersonId
      : undefined;
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;

  if (status !== undefined && !isPermitStatus(status)) {
    throw new HttpError(400, "Invalid permit status.");
  }

  if (workType !== undefined && !isPermitToWorkType(workType)) {
    throw new HttpError(400, "Invalid permit work type.");
  }

  for (const [label, value] of [
    ["project", projectId],
    ["site", siteId],
    ["responsible person", responsiblePersonId],
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
  const scope = permitScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (workType) conditions.push({ workType });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });
  if (responsiblePersonId) {
    conditions.push({
      responsiblePerson: new Types.ObjectId(responsiblePersonId),
    });
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    conditions.push({
      $or: [{ workDescription: pattern }, { location: pattern }],
    });
  }

  const filter =
    conditions.length > 0
      ? { $and: conditions }
      : ({} as Record<string, unknown>);

  const { page, limit, skip } = parsePagination(req.query);

  const [total, permits] = await Promise.all([
    Permit.countDocuments(filter),
    Permit.find(filter)
      .sort({ validFrom: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(PERMIT_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    permits: permits.map(toPermitSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create a draft permit. The site is mandatory, active and project-bound; the
// responsible person must be active and authorised for that site.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreatePermits(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to create permits.");
  }

  const parsed = createPermitSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  assertSiteAccess(viewer, data.siteId);

  const permit = await runAuditedMutation(viewer._id, async (session) => {
    const resolved = await resolvePermitProjectAndSite(
      session,
      data.projectId,
      data.siteId,
    );

    await assertPermitResponsiblePerson(
      data.responsiblePersonId,
      resolved.site,
      session,
    );

    const created = new Permit({
      workDescription: data.workDescription,
      workType: data.workType,
      status: "DRAFT",
      // Stamped once, at creation. Never recomputed by later edits.
      policyVersion: activePermitPolicyVersion(),
      project: resolved.project,
      site: resolved.site,
      location: data.location ?? "",
      validFrom: data.validFrom,
      validTo: data.validTo,
      responsiblePerson: new Types.ObjectId(data.responsiblePersonId),
      workersInvolved: data.workersInvolved,
      requiredPrecautions: data.requiredPrecautions,
      hazards: data.hazards,
      createdBy: viewer._id,
    });

    await created.save({ session });

    return {
      result: created,
      audit: {
        action: "permit.created",
        entityType: "Permit",
        entityId: created._id,
        after: permitAuditSnapshot(created),
      },
    };
  });

  await permit.populate(PERMIT_POPULATE);

  res.status(201).json({
    success: true,
    permit: toPermitSummary(permit),
  });
});

// Read one permit. Out-of-scope permits return 404 so existence is not leaked
// to non-management users.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const permitId = parseObjectIdParam(req.params.id, "permit");

  const permit = await Permit.findById(permitId).populate(PERMIT_POPULATE);

  if (!permit) {
    throw new HttpError(404, "Permit not found.");
  }

  assertPermitAccess(viewer, permit);

  res.status(200).json({
    success: true,
    permit: toPermitSummary(permit),
  });
});

// Edit DRAFT permit content. Status and workflow fields are absent from the
// update schema and can only be changed through `/:id/status`.
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const permitId = parseObjectIdParam(req.params.id, "permit");

  if (!canCreatePermits(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to edit permits.");
  }

  const parsed = updatePermitSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const data = parsed.data;

  const permit = await runAuditedMutation(viewer._id, async (session) => {
    const permit = await Permit.findById(permitId).session(session);

    if (!permit) {
      throw new HttpError(404, "Permit not found.");
    }

    assertPermitAccess(viewer, permit);

    if (!canEditPermit(viewer, permit)) {
      throw new HttpError(
        403,
        "Only the creator, responsible person or HSE management can edit a draft permit.",
      );
    }

    const before = permitAuditSnapshot(permit);

    const projectId = data.projectId ?? String(permit.project);
    const siteId = data.siteId ?? String(permit.site);

    const resolved = await resolvePermitProjectAndSite(
      session,
      projectId,
      siteId,
    );

    const responsiblePersonId =
      data.responsiblePersonId ?? String(permit.responsiblePerson);

    await assertPermitResponsiblePerson(
      responsiblePersonId,
      resolved.site,
      session,
    );

    const validFrom = data.validFrom ?? permit.validFrom;
    const validTo = data.validTo ?? permit.validTo;

    if (validTo.getTime() <= validFrom.getTime()) {
      throw new HttpError(400, "Validity must end after it starts.");
    }

    if (data.workDescription !== undefined) {
      permit.workDescription = data.workDescription;
    }
    if (data.workType !== undefined) {
      permit.workType = data.workType;
    }
    if (data.location !== undefined) {
      permit.location = data.location;
    }
    if (data.validFrom !== undefined) {
      permit.validFrom = data.validFrom;
    }
    if (data.validTo !== undefined) {
      permit.validTo = data.validTo;
    }
    if (data.workersInvolved !== undefined) {
      permit.workersInvolved = data.workersInvolved;
    }
    if (data.requiredPrecautions !== undefined) {
      permit.requiredPrecautions = data.requiredPrecautions;
    }
    if (data.hazards !== undefined) {
      permit.hazards = data.hazards as typeof permit.hazards;
    }

    permit.project = resolved.project;
    permit.site = resolved.site;
    permit.responsiblePerson = new Types.ObjectId(responsiblePersonId);

    await permit.save({ session });

    return {
      result: permit,
      audit: {
        action: "permit.updated",
        entityType: "Permit",
        entityId: permit._id,
        before,
        after: permitAuditSnapshot(permit),
      },
    };
  });

  await permit.populate(PERMIT_POPULATE);

  res.status(200).json({
    success: true,
    permit: toPermitSummary(permit),
  });
});

// Progress the permit lifecycle. Every action has its own authorization rule;
// activation and resumption are additionally bounded by the validity window.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const permitId = parseObjectIdParam(req.params.id, "permit");

    const parsed = updatePermitStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const nextStatus = parsed.data.status;

    const permit = await runAuditedMutation(viewer._id, async (session) => {
      const permit = await Permit.findById(permitId).session(session);

      if (!permit) {
        throw new HttpError(404, "Permit not found.");
      }

      assertPermitAccess(viewer, permit);

      if (
        !canTransitionPermitStatus(
          permit.status as PermitStatus,
          nextStatus,
        )
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${permit.status} to ${nextStatus}.`,
        );
      }

      const before = permitAuditSnapshot(permit);
      const now = Date.now();

      if (nextStatus === "SUBMITTED") {
        if (!canSubmitPermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only the creator, responsible person or HSE management can submit this permit.",
          );
        }

        permit.submittedBy = viewer._id;
        permit.submittedAt = new Date();
      } else if (nextStatus === "APPROVED") {
        if (!canApprovePermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only HSE management who is not the creator, responsible person or submitter can approve this permit.",
          );
        }

        if (permit.validTo.getTime() < now) {
          throw new HttpError(
            409,
            "An expired permit cannot be approved.",
          );
        }

        await assertPermitReadyForWork(permit, session);

        permit.approvedBy = viewer._id;
        permit.approvedAt = new Date();
      } else if (nextStatus === "REJECTED") {
        if (!canApprovePermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only HSE management who is not the creator, responsible person or submitter can reject this permit.",
          );
        }

        permit.rejectedBy = viewer._id;
        permit.rejectedAt = new Date();
        permit.rejectionReason = parsed.data.reason ?? null;
      } else if (nextStatus === "ACTIVE") {
        const isResuming = permit.status === "SUSPENDED";

        if (isResuming ? !canResumePermit(viewer, permit) : !canActivatePermit(viewer, permit)) {
          throw new HttpError(
            403,
            isResuming
              ? "Only the responsible person or HSE management can resume this permit."
              : "Only the responsible person or HSE management can activate this permit.",
          );
        }

        if (now < permit.validFrom.getTime()) {
          throw new HttpError(
            409,
            "This permit cannot be activated before its validity window starts.",
          );
        }

        if (now > permit.validTo.getTime()) {
          throw new HttpError(
            409,
            "This permit has expired and cannot be activated or resumed. Close it instead.",
          );
        }

        if (!isWithinValidity(permit, now)) {
          throw new HttpError(
            409,
            "The permit is outside its validity window.",
          );
        }

        await assertPermitReadyForWork(permit, session);

        if (isResuming) {
          permit.resumedBy = viewer._id;
          permit.resumedAt = new Date();
        } else {
          permit.activatedBy = viewer._id;
          permit.activatedAt = new Date();
        }
      } else if (nextStatus === "SUSPENDED") {
        if (!canSuspendPermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only the responsible person, an HSE officer for this site or HSE management can suspend this permit.",
          );
        }

        if (now > permit.validTo.getTime()) {
          throw new HttpError(
            409,
            "An expired permit cannot be suspended. Close it instead.",
          );
        }

        permit.suspendedBy = viewer._id;
        permit.suspendedAt = new Date();
        permit.suspensionReason = parsed.data.reason ?? null;
      } else if (nextStatus === "CLOSED") {
        if (!canClosePermit(viewer, permit)) {
          throw new HttpError(
            403,
            "Only the responsible person or HSE management can close this permit.",
          );
        }

        const checks = parsed.data.closureChecks;

        if (
          !checks ||
          !checks.workAreaSecured ||
          !checks.personnelAccountedFor ||
          !checks.equipmentIsolated ||
          !checks.siteHandoverCompleted ||
          !parsed.data.closureNotes?.trim()
        ) {
          throw new HttpError(
            400,
            "All closure checks and closure notes are required before closing a permit.",
          );
        }

        permit.closedBy = viewer._id;
        permit.closedAt = new Date();
        permit.closureNotes = parsed.data.closureNotes;
        permit.closureChecks = {
          workAreaSecured: true,
          personnelAccountedFor: true,
          equipmentIsolated: true,
          siteHandoverCompleted: true,
        };
      } else if (nextStatus === "CANCELLED") {
        if (!canCancelPermit(viewer, permit)) {
          throw new HttpError(
            403,
            "You are not permitted to cancel this permit at its current status.",
          );
        }

        permit.cancelledBy = viewer._id;
        permit.cancelledAt = new Date();
        permit.cancellationReason = parsed.data.reason ?? null;
      }

      permit.status = nextStatus;

      await permit.save({ session });

      return {
        result: permit,
        audit: {
          action: "permit.status_changed",
          entityType: "Permit",
          entityId: permit._id,
          before,
          after: permitAuditSnapshot(permit),
        },
      };
    });

    await permit.populate(PERMIT_POPULATE);

    res.status(200).json({
      success: true,
      permit: toPermitSummary(permit),
    });
  },
);

export default router;
