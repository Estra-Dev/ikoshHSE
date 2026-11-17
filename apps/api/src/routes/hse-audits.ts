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
  createAuditFindingSchema,
  createAuditChecklistItemSchema,
  createHseAuditSchema,
  linkAuditFindingCorrectiveActionSchema,
  updateAuditChecklistItemSchema,
  updateHseAuditSchema,
  updateHseAuditStatusSchema,
} from "../lib/validation/hse-audit.js";
import {
  AUDIT_AUDITOR_ROLES,
  canTransitionAuditStatus,
  isAuditAuditorRole,
  isAuditStatus,
  isAuditType,
  isCorrectiveActionAssignableRole,
  type AuditStatus,
} from "../lib/hse-constants.js";
import { canConductAudits, canCreateAudits } from "../lib/hse-permissions.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { assertSiteAccess } from "../lib/site-access.js";
import {
  assertHseAuditAccess,
  hseAuditScopeFilter,
  isAuditAuditor,
} from "../lib/hse-audit-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import {
  correctiveActionAuditSnapshot,
  hseAuditAuditSnapshot,
} from "../lib/audit-snapshots.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { HseAudit, type HseAuditDocument } from "../models/HseAudit.js";
import { Project } from "../models/Project.js";
import { Site } from "../models/Site.js";
import { User } from "../models/User.js";
import { toCorrectiveActionSummary } from "../serializers/corrective-action.js";
import { toHseAuditSummary } from "../serializers/hse-audit.js";

const router: Router = Router();

const HSE_AUDIT_POPULATE = [
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "auditors", select: "firstName lastName" },
  { path: "completedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

const HSE_AUDIT_DETAIL_POPULATE = [
  ...HSE_AUDIT_POPULATE,
  { path: "findings.correctiveAction", select: "description status" },
];

const CORRECTIVE_ACTION_POPULATE = [
  { path: "incident", select: "type title" },
  { path: "inspection", select: "title" },
  { path: "audit", select: "title" },
  { path: "project", select: "name" },
  { path: "site", select: "name code" },
  { path: "assignedTo", select: "firstName lastName" },
  { path: "completedBy", select: "firstName lastName" },
  { path: "verifiedBy", select: "firstName lastName" },
  { path: "createdBy", select: "firstName lastName" },
];

// Every audit route requires an authenticated, active IKOSH employee with at
// least read access to the register.
router.use(requireAuth(digitAuth), attachIkoshUser);
router.use(
  requireIkoshRole("ADMIN", "HSE_MANAGER", "HSE_OFFICER", "SUPERVISOR"),
);

/** Only active HSE personnel may conduct an audit. */
async function assertAssignableAuditors(
  auditorIds: readonly string[],
  session: ClientSession,
): Promise<Types.ObjectId[]> {
  const uniqueIds = [...new Set(auditorIds)].map(
    (auditorId) => new Types.ObjectId(auditorId),
  );

  const auditors = await User.find({ _id: { $in: uniqueIds } })
    .session(session)
    .select("isActive ikoshRole");

  if (auditors.length !== uniqueIds.length) {
    throw new HttpError(400, "One or more auditors were not found.");
  }

  if (
    auditors.some(
      (auditor) =>
        !auditor.isActive || !isAuditAuditorRole(auditor.ikoshRole),
    )
  ) {
    throw new HttpError(
      400,
      "Auditors must be active HSE officers, managers or admins.",
    );
  }

  return uniqueIds;
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

type HseAuditDocumentWithFindings = HydratedDocument<HseAuditDocument>;

interface FindingLike {
  _id?: unknown;
  description: string;
  severity: string;
  recommendation?: string | null;
  correctiveAction?: unknown;
}

function findFinding(
  audit: HseAuditDocumentWithFindings,
  findingId: string,
): FindingLike | undefined {
  return (audit.findings ?? []).find(
    (finding) => String(finding._id) === findingId,
  );
}

/**
 * Checklist and finding edits are limited to management and assigned
 * auditors, and are closed once the audit is completed or cancelled.
 */
function assertAuditConductAccess(
  viewer: ReturnType<typeof getIkoshUser>,
  audit: HseAuditDocumentWithFindings,
): void {
  if (!canConductAudits(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to conduct audits.");
  }

  const isManagement = isHseManagementRole(viewer.ikoshRole);

  if (!isManagement && !isAuditAuditor(viewer, audit)) {
    throw new HttpError(
      403,
      "Only an assigned auditor or HSE management can conduct this audit.",
    );
  }

  if (audit.status === "COMPLETED" || audit.status === "CANCELLED") {
    throw new HttpError(
      409,
      "Checklist results and findings cannot be changed on a completed or cancelled audit.",
    );
  }
}

// Assignable HSE auditors for the scheduling form. Declared before `/:id` so
// the literal path is not captured as an identifier.
router.get("/assignees", async (_req: Request, res: Response): Promise<void> => {
  const users = await User.find({
    isActive: true,
    ikoshRole: { $in: [...AUDIT_AUDITOR_ROLES] },
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

// Audit register. HSE management sees everything; other HSE roles see audits
// at their assigned sites and audits assigned to them.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const projectId =
    typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const siteId =
    typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const auditorId =
    typeof req.query.auditorId === "string" ? req.query.auditorId : undefined;
  const rawSearch = typeof req.query.q === "string" ? req.query.q : undefined;

  if (status !== undefined && !isAuditStatus(status)) {
    throw new HttpError(400, "Invalid audit status.");
  }

  if (type !== undefined && !isAuditType(type)) {
    throw new HttpError(400, "Invalid audit type.");
  }

  for (const [label, value] of [
    ["project", projectId],
    ["site", siteId],
    ["auditor", auditorId],
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
  const scope = hseAuditScopeFilter(viewer);

  if (Object.keys(scope).length > 0) {
    conditions.push(scope);
  }

  if (status) conditions.push({ status });
  if (type) conditions.push({ type });
  if (projectId) conditions.push({ project: new Types.ObjectId(projectId) });
  if (siteId) conditions.push({ site: new Types.ObjectId(siteId) });
  if (auditorId) {
    conditions.push({ auditors: new Types.ObjectId(auditorId) });
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

  const [total, audits] = await Promise.all([
    HseAudit.countDocuments(filter),
    HseAudit.find(filter)
      .sort({ scheduledFor: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(HSE_AUDIT_POPULATE)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    audits: audits.map(toHseAuditSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Schedule an audit. The project is mandatory; the site is optional but must
// belong to the project. Auditors must be active HSE personnel.
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);

  if (!canCreateAudits(viewer.ikoshRole)) {
    throw new HttpError(403, "You are not permitted to schedule audits.");
  }

  const parsed = createHseAuditSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const { title, type, projectId, siteId, auditorIds, scheduledFor } =
    parsed.data;

  if (siteId) {
    assertSiteAccess(viewer, siteId);
  }

  const audit = await runAuditedMutation(viewer._id, async (session) => {
    const resolved = await resolveProjectAndSite(session, projectId, siteId);

    const resolvedAuditors = await assertAssignableAuditors(
      auditorIds,
      session,
    );

    const created = new HseAudit({
      title,
      type,
      status: "PLANNED",
      project: resolved.project,
      site: resolved.site,
      auditors: resolvedAuditors,
      scheduledFor,
      description: parsed.data.description ?? "",
      checklist: (parsed.data.checklist ?? []).map((entry) => ({
        item: entry.item,
        result: "PENDING",
        notes: entry.notes ?? "",
      })),
      findings: [],
      createdBy: viewer._id,
    });

    await created.save({ session });

    return {
      result: created,
      audit: {
        action: "hse_audit.created",
        entityType: "HseAudit",
        entityId: created._id,
        after: hseAuditAuditSnapshot(created),
      },
    };
  });

  await audit.populate(HSE_AUDIT_DETAIL_POPULATE);

  res.status(201).json({
    success: true,
    audit: toHseAuditSummary(audit),
  });
});

// Read one audit. Out-of-scope audits return 404 so existence is not leaked to
// non-management users.
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const auditId = parseObjectIdParam(req.params.id, "audit");

  const audit = await HseAudit.findById(auditId).populate(
    HSE_AUDIT_DETAIL_POPULATE,
  );

  if (!audit) {
    throw new HttpError(404, "Audit not found.");
  }

  assertHseAuditAccess(viewer, audit);

  res.status(200).json({
    success: true,
    audit: toHseAuditSummary(audit),
  });
});

// Update schedule metadata or reassign auditors (HSE_MANAGER + ADMIN only).
// Completed and cancelled audits are immutable.
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const auditId = parseObjectIdParam(req.params.id, "audit");

    const parsed = updateHseAuditSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const audit = await runAuditedMutation(viewer._id, async (session) => {
      const audit = await HseAudit.findById(auditId).session(session);

      if (!audit) {
        throw new HttpError(404, "Audit not found.");
      }

      if (audit.status === "COMPLETED" || audit.status === "CANCELLED") {
        throw new HttpError(
          409,
          "Completed or cancelled audits cannot be edited.",
        );
      }

      const before = hseAuditAuditSnapshot(audit);
      const {
        title,
        type,
        projectId,
        siteId,
        auditorIds,
        scheduledFor,
        description,
      } = parsed.data;

      let nextProject = audit.project;
      let nextSite = audit.site;

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
      // audit, so moving the audit afterwards would break their provenance.
      const hasLinkedAction = (audit.findings ?? []).some(
        (finding) => finding.correctiveAction,
      );

      if (
        hasLinkedAction &&
        (String(nextProject) !== String(audit.project) ||
          referenceId(nextSite) !== referenceId(audit.site))
      ) {
        throw new HttpError(
          409,
          "Project and site cannot change once a finding is linked to a corrective action.",
        );
      }

      if (auditorIds !== undefined) {
        audit.auditors = await assertAssignableAuditors(
          auditorIds,
          session,
        );
      }

      if (title !== undefined) audit.title = title;
      if (type !== undefined) audit.type = type;
      if (description !== undefined) audit.description = description;
      if (scheduledFor !== undefined) audit.scheduledFor = scheduledFor;

      audit.project = nextProject;
      audit.site = nextSite;

      await audit.save({ session });

      return {
        result: audit,
        audit: {
          action: "hse_audit.updated",
          entityType: "HseAudit",
          entityId: audit._id,
          before,
          after: hseAuditAuditSnapshot(audit),
        },
      };
    });

    await audit.populate(HSE_AUDIT_DETAIL_POPULATE);

    res.status(200).json({
      success: true,
      audit: toHseAuditSummary(audit),
    });
  },
);

// Progress, complete or cancel an audit. Assigned auditors may move their own
// audit forward; only HSE management may cancel.
router.patch(
  "/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const auditId = parseObjectIdParam(req.params.id, "audit");

    const parsed = updateHseAuditStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const nextStatus = parsed.data.status;

    const audit = await runAuditedMutation(viewer._id, async (session) => {
      const audit = await HseAudit.findById(auditId).session(session);

      if (!audit) {
        throw new HttpError(404, "Audit not found.");
      }

      if (!canConductAudits(viewer.ikoshRole)) {
        throw new HttpError(
          403,
          "You are not permitted to progress audits.",
        );
      }

      const isManagement = isHseManagementRole(viewer.ikoshRole);
      const isAssignedAuditor = isAuditAuditor(viewer, audit);

      if (nextStatus === "CANCELLED" && !isManagement) {
        throw new HttpError(
          403,
          "Only HSE management can cancel an audit.",
        );
      }

      if (nextStatus !== "CANCELLED" && !isManagement && !isAssignedAuditor) {
        throw new HttpError(
          403,
          "Only an assigned auditor or HSE management can progress this audit.",
        );
      }

      if (
        !canTransitionAuditStatus(
          audit.status as AuditStatus,
          nextStatus,
        )
      ) {
        throw new HttpError(
          409,
          `Invalid status transition from ${audit.status} to ${nextStatus}.`,
        );
      }

      if (
        nextStatus === "COMPLETED" &&
        !parsed.data.completionNotes &&
        (audit.findings ?? []).length === 0
      ) {
        throw new HttpError(
          400,
          "Record at least one finding or completion notes before completing an audit.",
        );
      }

      const before = hseAuditAuditSnapshot(audit);

      audit.status = nextStatus;

      if (nextStatus === "COMPLETED") {
        audit.completionNotes = parsed.data.completionNotes ?? null;
        audit.completedAt = new Date();
        audit.completedBy = viewer._id;
      }

      await audit.save({ session });

      return {
        result: audit,
        audit: {
          action: "hse_audit.status_changed",
          entityType: "HseAudit",
          entityId: audit._id,
          before,
          after: hseAuditAuditSnapshot(audit),
        },
      };
    });

    await audit.populate(HSE_AUDIT_DETAIL_POPULATE);

    res.status(200).json({
      success: true,
      audit: toHseAuditSummary(audit),
    });
  },
);

// Add a checklist question. Auditors may prepare the checklist while the audit
// is planned or in progress.
router.post(
  "/:id/checklist",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const auditId = parseObjectIdParam(req.params.id, "audit");

    const parsed = createAuditChecklistItemSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const audit = await runAuditedMutation(viewer._id, async (session) => {
      const audit = await HseAudit.findById(auditId).session(session);

      if (!audit) {
        throw new HttpError(404, "Audit not found.");
      }

      assertAuditConductAccess(viewer, audit);

      audit.checklist.push({
        item: parsed.data.item,
        result: "PENDING",
        notes: parsed.data.notes ?? "",
      });

      await audit.save({ session });

      return {
        result: audit,
        audit: {
          action: "hse_audit.checklist_added",
          entityType: "HseAudit",
          entityId: audit._id,
          after: hseAuditAuditSnapshot(audit),
        },
      };
    });

    await audit.populate(HSE_AUDIT_DETAIL_POPULATE);

    res.status(201).json({
      success: true,
      audit: toHseAuditSummary(audit),
    });
  },
);

// Record or update one checklist result.
router.patch(
  "/:id/checklist/:itemId",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const auditId = parseObjectIdParam(req.params.id, "audit");
    const itemId = parseObjectIdParam(req.params.itemId, "checklist item");

    const parsed = updateAuditChecklistItemSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const audit = await runAuditedMutation(viewer._id, async (session) => {
      const audit = await HseAudit.findById(auditId).session(session);

      if (!audit) {
        throw new HttpError(404, "Audit not found.");
      }

      assertAuditConductAccess(viewer, audit);

      const item = (audit.checklist ?? []).find(
        (entry) => String(entry._id) === itemId,
      );

      if (!item) {
        throw new HttpError(404, "Checklist item not found.");
      }

      item.result = parsed.data.result;

      if (parsed.data.notes !== undefined) {
        item.notes = parsed.data.notes;
      }

      await audit.save({ session });

      return {
        result: audit,
        audit: {
          action: "hse_audit.checklist_updated",
          entityType: "HseAudit",
          entityId: audit._id,
          after: hseAuditAuditSnapshot(audit),
        },
      };
    });

    await audit.populate(HSE_AUDIT_DETAIL_POPULATE);

    res.status(200).json({
      success: true,
      audit: toHseAuditSummary(audit),
    });
  },
);

// Record a finding. Findings may only be added while the audit is planned or
// in progress.
router.post(
  "/:id/findings",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const auditId = parseObjectIdParam(req.params.id, "audit");

    const parsed = createAuditFindingSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const audit = await runAuditedMutation(viewer._id, async (session) => {
      const audit = await HseAudit.findById(auditId).session(session);

      if (!audit) {
        throw new HttpError(404, "Audit not found.");
      }

      assertAuditConductAccess(viewer, audit);

      audit.findings.push({
        description: parsed.data.description,
        severity: parsed.data.severity,
        recommendation: parsed.data.recommendation ?? null,
        correctiveAction: null,
        createdBy: viewer._id,
      });

      await audit.save({ session });

      return {
        result: audit,
        audit: {
          action: "hse_audit.finding_added",
          entityType: "HseAudit",
          entityId: audit._id,
          after: hseAuditAuditSnapshot(audit),
        },
      };
    });

    await audit.populate(HSE_AUDIT_DETAIL_POPULATE);

    res.status(201).json({
      success: true,
      audit: toHseAuditSummary(audit),
    });
  },
);

// Raise a corrective action from one finding. The CAPA, the finding backlink
// and both audit rows are written in a single transaction so the pair cannot
// diverge. Project and site are derived from the audit.
router.post(
  "/:id/findings/:findingId/corrective-action",
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const auditId = parseObjectIdParam(req.params.id, "audit");
    const findingId = parseObjectIdParam(req.params.findingId, "finding");

    const parsed = linkAuditFindingCorrectiveActionSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const outcome = await runAuditedMutation(viewer._id, async (session) => {
      const audit = await HseAudit.findById(auditId).session(session);

      if (!audit) {
        throw new HttpError(404, "Audit not found.");
      }

      assertAuditConductAccess(viewer, audit);

      const finding = findFinding(audit, findingId);

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
        source: "HSE_AUDIT",
        incident: null,
        inspection: null,
        audit: audit._id,
        findingId: null,
        auditFindingId: finding._id,
        project: audit.project,
        site: audit.site,
        assignedTo: new Types.ObjectId(parsed.data.assignedTo),
        dueDate: parsed.data.dueDate,
        status: "OPEN",
        createdBy: viewer._id,
      });

      await created.save({ session });

      finding.correctiveAction = created._id;

      await audit.save({ session });

      return {
        result: { audit, correctiveAction: created },
        audit: {
          action: "hse_audit.finding_linked",
          entityType: "HseAudit",
          entityId: audit._id,
          after: hseAuditAuditSnapshot(audit),
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

    await outcome.audit.populate(HSE_AUDIT_DETAIL_POPULATE);
    await outcome.correctiveAction.populate(CORRECTIVE_ACTION_POPULATE);

    res.status(201).json({
      success: true,
      audit: toHseAuditSummary(outcome.audit),
      correctiveAction: toCorrectiveActionSummary(outcome.correctiveAction),
    });
  },
);

export default router;
