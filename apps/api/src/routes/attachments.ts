import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import multer from "multer";
import { Types, type ClientSession } from "mongoose";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
  parsePagination,
} from "../lib/validation/common.js";
import {
  attachmentSizeLimit,
  attachmentUploadFieldsSchema,
  updateAttachmentSchema,
} from "../lib/validation/attachment.js";
import {
  attachIkoshUser,
  getIkoshUser,
} from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import {
  isHseManagementRole,
  isManagementRole,
} from "../lib/ikosh-constants.js";
import {
  isPermitTerminalStatus,
  isToolboxTalkTerminalStatus,
  isTrainingSessionTerminalStatus,
} from "../lib/hse-constants.js";
import {
  canViewCorrectiveActions,
  canViewInspections,
  canViewAudits,
  canViewPermits,
  canViewRiskAssessments,
  canViewTraining,
  canViewToolboxTalks,
} from "../lib/hse-permissions.js";
import {
  assertTrainingSessionAccess,
  canAccessTrainingSession,
  canUploadTrainingEvidence,
  trainingScopeFilter,
} from "../lib/training-access.js";
import {
  assertToolboxTalkAccess,
  canAccessToolboxTalk,
  canUploadToolboxTalkEvidence,
  toolboxTalkScopeFilter,
} from "../lib/toolbox-talk-access.js";
import {
  canAccessCorrectiveAction,
  canUploadCorrectiveActionEvidence,
} from "../lib/corrective-action-access.js";
import {
  canAccessInspection,
  canUploadInspectionEvidence,
} from "../lib/inspection-access.js";
import {
  canAccessHseAudit,
  canUploadHseAuditEvidence,
} from "../lib/hse-audit-access.js";
import {
  assertPermitAccess,
  canAccessPermit,
  canUploadPermitEvidence,
  permitScopeFilter,
} from "../lib/permit-access.js";
import {
  canAccessRiskAssessment,
  canUploadRiskAssessmentEvidence,
  riskAssessmentScopeFilter,
} from "../lib/risk-assessment-access.js";
import {
  assertIncidentAccess,
  canAccessIncident,
  incidentEvidenceFilter,
  isIncidentReporter,
} from "../lib/incident-access.js";
import {
  isSiteAssigned,
  assertSiteAccess,
  type SiteScopedViewer,
} from "../lib/site-access.js";
import { runAuditedMutation } from "../lib/audit-log.js";
import { attachmentAuditSnapshot } from "../lib/audit-snapshots.js";
import {
  assertAttachmentContent,
} from "../lib/attachments/file-signature.js";
import {
  deleteAttachmentBytes,
  readAttachmentBytes,
  sanitizeOriginalFilename,
  saveAttachmentBytes,
  sha256Hex,
} from "../lib/attachments/storage.js";
import { Attachment } from "../models/Attachment.js";
import { CorrectiveAction } from "../models/CorrectiveAction.js";
import { HseAudit } from "../models/HseAudit.js";
import { Incident } from "../models/Incident.js";
import { Inspection } from "../models/Inspection.js";
import { Permit } from "../models/Permit.js";
import { RiskAssessment } from "../models/RiskAssessment.js";
import { Site } from "../models/Site.js";
import { TrainingSession } from "../models/TrainingSession.js";
import { ToolboxTalk } from "../models/ToolboxTalk.js";
import { toAttachmentSummary } from "../serializers/attachment.js";

const router: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: attachmentSizeLimit, files: 1 },
});

/** Runs multer and maps upload limit errors onto safe HTTP responses. */
function acceptSingleFile(
  req: Request,
  res: Response,
  next: (error?: unknown) => void,
): void {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(
          new HttpError(
            413,
            `File exceeds the ${attachmentSizeLimit / (1024 * 1024)} MB limit.`,
          ),
        );
        return;
      }

      next(new HttpError(400, "Invalid file upload."));
      return;
    }

    if (error) {
      next(error);
      return;
    }

    next();
  });
}

// All attachment routes require authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

/**
 * Confirms that the linked entity exists and the viewer may attach to it.
 * Site-bound records are checked through the shared site-access rules.
 */
async function assertAttachmentEntityAccess(
  session: ClientSession,
  viewer: SiteScopedViewer & { _id: unknown },
  entityType: string | null,
  entityId: unknown,
): Promise<void> {
  if (!entityType || !entityId) {
    return;
  }

  if (entityType === "site") {
    const site = await Site.findById(entityId).session(session);

    if (!site) {
      throw new HttpError(404, "Specified site was not found.");
    }

    assertSiteAccess(viewer, entityId);
    return;
  }

  if (entityType === "incident") {
    const incident = await Incident.findById(entityId).session(session);

    if (!incident) {
      throw new HttpError(404, "Specified incident was not found.");
    }

    // Reporters may attach evidence to their own report even after leaving
    // the site; everyone else follows the existing site-scoped rule.
    assertIncidentAccess(viewer, incident);
    return;
  }

  if (entityType === "corrective_action") {
    const action = await CorrectiveAction.findById(entityId).session(session);

    if (!action) {
      throw new HttpError(404, "Specified corrective action was not found.");
    }

    if (!canUploadCorrectiveActionEvidence(viewer, action)) {
      // Distinguish a closed action from an unauthorized caller without
      // leaking status: the status-free check below only succeeds for
      // management, the creator or the assignee.
      if (
        action.status === "VERIFIED" &&
        canUploadCorrectiveActionEvidence(viewer, {
          createdBy: action.createdBy,
          assignedTo: action.assignedTo,
        })
      ) {
        throw new HttpError(
          409,
          "Evidence cannot be added to a verified corrective action.",
        );
      }

      throw new HttpError(404, "Specified corrective action was not found.");
    }

    return;
  }

  if (entityType === "inspection") {
    const inspection = await Inspection.findById(entityId).session(session);

    if (!inspection) {
      throw new HttpError(404, "Specified inspection was not found.");
    }

    if (!canUploadInspectionEvidence(viewer, inspection)) {
      // Distinguish a cancelled inspection from an unauthorized caller without
      // leaking status: the status-free check below only succeeds for
      // management, the creator or the inspector.
      if (
        inspection.status === "CANCELLED" &&
        canUploadInspectionEvidence(viewer, {
          createdBy: inspection.createdBy,
          inspector: inspection.inspector,
        })
      ) {
        throw new HttpError(
          409,
          "Evidence cannot be added to a cancelled inspection.",
        );
      }

      throw new HttpError(404, "Specified inspection was not found.");
    }

    return;
  }

  if (entityType === "hse_audit") {
    const audit = await HseAudit.findById(entityId).session(session);

    if (!audit) {
      throw new HttpError(404, "Specified audit was not found.");
    }

    if (!canUploadHseAuditEvidence(viewer, audit)) {
      // Distinguish a closed audit from an unauthorized caller without leaking
      // status: the status-free check below only succeeds for management, the
      // creator or an assigned auditor.
      if (
        (audit.status === "COMPLETED" || audit.status === "CANCELLED") &&
        canUploadHseAuditEvidence(viewer, {
          createdBy: audit.createdBy,
          auditors: audit.auditors,
        })
      ) {
        throw new HttpError(
          409,
          "Evidence cannot be added to a completed or cancelled audit.",
        );
      }

      throw new HttpError(404, "Specified audit was not found.");
    }

    return;
  }

  if (entityType === "risk_assessment") {
    const assessment = await RiskAssessment.findById(entityId).session(session);

    if (!assessment) {
      throw new HttpError(404, "Specified risk assessment was not found.");
    }

    if (!canUploadRiskAssessmentEvidence(viewer, assessment)) {
      // Distinguish an archived assessment from an unauthorized caller.
      if (
        assessment.status === "ARCHIVED" &&
        canUploadRiskAssessmentEvidence(viewer, {
          status: "APPROVED",
          owner: assessment.owner,
          createdBy: assessment.createdBy,
        })
      ) {
        throw new HttpError(
          409,
          "Evidence cannot be added to an archived risk assessment.",
        );
      }

      throw new HttpError(404, "Specified risk assessment was not found.");
    }

    return;
  }

  if (entityType === "permit") {
    const permit = await Permit.findById(entityId).session(session);

    if (!permit) {
      throw new HttpError(404, "Specified permit was not found.");
    }

    assertPermitAccess(viewer, permit);

    if (!canUploadPermitEvidence(viewer, permit)) {
      if (
        isPermitTerminalStatus(permit.status) &&
        (isHseManagementRole(viewer.ikoshRole) ||
          String(permit.createdBy) === String(viewer._id) ||
          String(permit.responsiblePerson) === String(viewer._id))
      ) {
        throw new HttpError(
          409,
          "Evidence cannot be added to a closed, rejected or cancelled permit.",
        );
      }

      throw new HttpError(404, "Specified permit was not found.");
    }

    return;
  }

  if (entityType === "training_session") {
    const trainingSession = await TrainingSession.findById(entityId).session(
      session,
    );

    if (!trainingSession) {
      throw new HttpError(404, "Specified training session was not found.");
    }

    assertTrainingSessionAccess(viewer, trainingSession);

    if (!canUploadTrainingEvidence(viewer, trainingSession)) {
      if (
        isTrainingSessionTerminalStatus(trainingSession.status) &&
        (isHseManagementRole(viewer.ikoshRole) ||
          String(trainingSession.createdBy) === String(viewer._id))
      ) {
        throw new HttpError(
          409,
          "Evidence cannot be added to a completed or cancelled training session.",
        );
      }

      throw new HttpError(404, "Specified training session was not found.");
    }

    return;
  }

  if (entityType === "toolbox_talk") {
    const talk = await ToolboxTalk.findById(entityId).session(session);

    if (!talk) {
      throw new HttpError(404, "Specified toolbox talk was not found.");
    }

    assertToolboxTalkAccess(viewer, talk);

    if (!canUploadToolboxTalkEvidence(viewer, talk)) {
      if (
        isToolboxTalkTerminalStatus(talk.status) &&
        (isHseManagementRole(viewer.ikoshRole) ||
          String(talk.createdBy) === String(viewer._id))
      ) {
        throw new HttpError(
          409,
          "Evidence cannot be added to a completed or cancelled toolbox talk.",
        );
      }

      throw new HttpError(404, "Specified toolbox talk was not found.");
    }

    return;
  }

  throw new HttpError(400, "Unsupported attachment entity type.");
}

async function buildVisibleAttachmentFilter(
  viewer: SiteScopedViewer & { _id: unknown },
): Promise<Record<string, unknown>> {
  if (isHseManagementRole(viewer.ikoshRole)) {
    return {};
  }

  const assignedSites = (viewer.assignedSites ?? []).map(
    (siteId) => new Types.ObjectId(String(siteId)),
  );
  // Ordinary employees only see evidence for their own reports. Supervisors
  // and HSE staff keep site-scoped incident evidence.
  const incidentIds = await Incident.distinct(
    "_id",
    incidentEvidenceFilter(viewer),
  );
  const canViewActions = canViewCorrectiveActions(viewer.ikoshRole);
  const actionScope = {
    $or: [
      { assignedTo: viewer._id as Types.ObjectId },
      { site: { $in: assignedSites } },
    ],
  };
  const correctiveActionIds = canViewActions
    ? (await CorrectiveAction.find(actionScope).lean()).map(
        (action) => action._id,
      )
    : [];

  const canViewInspectionRecords = canViewInspections(viewer.ikoshRole);
  const inspectionScope = {
    $or: [
      { inspector: viewer._id as Types.ObjectId },
      { site: { $in: assignedSites } },
    ],
  };
  const inspectionIds = canViewInspectionRecords
    ? (await Inspection.find(inspectionScope).lean()).map(
        (inspection) => inspection._id,
      )
    : [];

  const canViewAuditRecords = canViewAudits(viewer.ikoshRole);
  const auditScope = {
    $or: [
      { auditors: viewer._id as Types.ObjectId },
      { site: { $in: assignedSites } },
    ],
  };
  const auditIds = canViewAuditRecords
    ? (await HseAudit.find(auditScope).lean()).map((audit) => audit._id)
    : [];

  const canViewPermitRecords = canViewPermits(viewer.ikoshRole);
  const permitIds = canViewPermitRecords
    ? (await Permit.find(permitScopeFilter(viewer)).select("_id").lean()).map(
        (permit) => permit._id,
      )
    : [];

  const canViewTrainingRecords = canViewTraining(viewer.ikoshRole);
  const trainingSessionIds = canViewTrainingRecords
    ? (
        await TrainingSession.find(trainingScopeFilter(viewer))
          .select("_id")
          .lean()
      ).map((session) => session._id)
    : [];

  const canViewToolboxRecords = canViewToolboxTalks(viewer.ikoshRole);
  const toolboxTalkIds = canViewToolboxRecords
    ? (
        await ToolboxTalk.find(toolboxTalkScopeFilter(viewer))
          .select("_id")
          .lean()
      ).map((talk) => talk._id)
    : [];

  const canViewRiskAssessmentRecords = canViewRiskAssessments(
    viewer.ikoshRole,
  );
  const riskAssessmentIds = canViewRiskAssessmentRecords
    ? (
        await RiskAssessment.find(riskAssessmentScopeFilter(viewer))
          .select("_id")
          .lean()
      ).map((assessment) => assessment._id)
    : [];

  const filter: Record<string, unknown> = {
    $or: [
      { uploadedBy: viewer._id },
      { entityType: "site", entityId: { $in: assignedSites } },
      {
        entityType: "incident",
        entityId: { $in: incidentIds },
      },
      {
        entityType: "corrective_action",
        entityId: { $in: correctiveActionIds },
      },
      {
        entityType: "inspection",
        entityId: { $in: inspectionIds },
      },
      {
        entityType: "hse_audit",
        entityId: { $in: auditIds },
      },
      {
        entityType: "permit",
        entityId: { $in: permitIds },
      },
      {
        entityType: "training_session",
        entityId: { $in: trainingSessionIds },
      },
      {
        entityType: "toolbox_talk",
        entityId: { $in: toolboxTalkIds },
      },
      {
        entityType: "risk_assessment",
        entityId: { $in: riskAssessmentIds },
      },
    ],
  };

  // Ordinary employees have no CAPA, inspection, audit or permit access, even
  // if they happen to have uploaded a file that was later linked to one.
  const hidden: Record<string, unknown>[] = [];

  if (!canViewActions) {
    hidden.push({ entityType: { $ne: "corrective_action" } });
  }

  if (!canViewInspectionRecords) {
    hidden.push({ entityType: { $ne: "inspection" } });
  }

  if (!canViewAuditRecords) {
    hidden.push({ entityType: { $ne: "hse_audit" } });
  }

  if (!canViewPermitRecords) {
    hidden.push({ entityType: { $ne: "permit" } });
  }

  if (!canViewTrainingRecords) {
    hidden.push({ entityType: { $ne: "training_session" } });
  }

  if (!canViewToolboxRecords) {
    hidden.push({ entityType: { $ne: "toolbox_talk" } });
  }

  if (!canViewRiskAssessmentRecords) {
    hidden.push({ entityType: { $ne: "risk_assessment" } });
  }

  if (hidden.length > 0) {
    filter.$and = hidden;
  }

  return filter;
}

// List attachments. HSE management sees everything; everyone else sees their
// own uploads plus files linked to their assigned sites/incidents.
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(req);
  const entityType =
    typeof req.query.entityType === "string"
      ? req.query.entityType
      : undefined;
  const entityId =
    typeof req.query.entityId === "string" ? req.query.entityId : undefined;

  if (entityId && !Types.ObjectId.isValid(entityId)) {
    throw new HttpError(400, "Invalid entity ID.");
  }

  const entityFilter =
    entityType && entityId
      ? { entityType, entityId: new Types.ObjectId(entityId) }
      : {};

  const accessFilter = await buildVisibleAttachmentFilter(viewer);
  const filter =
    Object.keys(entityFilter).length > 0
      ? { $and: [entityFilter, accessFilter] }
      : accessFilter;

  const { page, limit, skip } = parsePagination(req.query);

  const [total, attachments] = await Promise.all([
    Attachment.countDocuments(filter),
    Attachment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    attachments: attachments.map(toAttachmentSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Upload a file. The server validates the actual bytes, calculates the
// checksum and writes the file under an opaque storage key. If the database
// write fails, the stored file is removed so no orphan is left behind.
router.post("/", acceptSingleFile, async (req: Request, res: Response) => {
  const viewer = getIkoshUser(req);
  const parsed = attachmentUploadFieldsSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  const file = req.file;

  if (!file || file.size === 0) {
    throw new HttpError(400, "A file is required.");
  }

  if (file.size > attachmentSizeLimit) {
    throw new HttpError(
      413,
      `File exceeds the ${attachmentSizeLimit / (1024 * 1024)} MB limit.`,
    );
  }

  assertAttachmentContent(file.buffer, file.mimetype);

  const checksum = sha256Hex(file.buffer);

  if (parsed.data.checksum && parsed.data.checksum !== checksum) {
    throw new HttpError(
      400,
      "Checksum does not match the uploaded file content.",
    );
  }

  const originalFilename = sanitizeOriginalFilename(file.originalname);
  const storageKey = await saveAttachmentBytes(file.buffer);

  const attachment = await runAuditedMutation(viewer._id, async (session) => {
    await assertAttachmentEntityAccess(
      session,
      viewer,
      parsed.data.entityType ?? null,
      parsed.data.entityId ?? null,
    );

    const created = new Attachment({
      storageKey,
      originalFilename,
      mimeType: file.mimetype,
      size: file.size,
      checksum,
      entityType: parsed.data.entityType ?? null,
      entityId: parsed.data.entityId
        ? new Types.ObjectId(parsed.data.entityId)
        : null,
      description: parsed.data.description ?? "",
      uploadedBy: viewer._id,
    });

    await created.save({ session });

    return {
      result: created,
      audit: {
        action: "attachment.created",
        entityType: "Attachment",
        entityId: created._id,
        after: attachmentAuditSnapshot(created),
      },
    };
  }).catch(async (error: unknown) => {
    await deleteAttachmentBytes(storageKey).catch(() => undefined);
    throw error;
  });

  res.status(201).json({
    success: true,
    attachment: toAttachmentSummary(attachment),
  });
});

// Update attachment metadata (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> => {
    const viewer = getIkoshUser(req);
    const attachmentId = parseObjectIdParam(req.params.id, "attachment");

    const parsed = updateAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const attachment = await runAuditedMutation(
      viewer._id,
      async (session) => {
        const attachment = await Attachment.findById(attachmentId).session(
          session,
        );

        if (!attachment) {
          throw new HttpError(404, "Attachment not found.");
        }

        const before = attachmentAuditSnapshot(attachment);
        const { entityType, entityId, description } = parsed.data;

        if (entityType !== undefined && entityId !== undefined) {
          await assertAttachmentEntityAccess(
            session,
            viewer,
            entityType,
            entityId,
          );

          attachment.entityType = entityType;
          attachment.entityId = new Types.ObjectId(entityId);
        }

        if (description !== undefined) {
          attachment.description = description;
        }

        await attachment.save({ session });

        return {
          result: attachment,
          audit: {
            action: "attachment.updated",
            entityType: "Attachment",
            entityId: attachment._id,
            before,
            after: attachmentAuditSnapshot(attachment),
          },
        };
      },
    );

    res.status(200).json({
      success: true,
      attachment: toAttachmentSummary(attachment),
    });
  },
);

// Stream an attachment after authorization and integrity verification.
router.get(
  "/:id/download",
  async (req: Request, res: Response): Promise<void> => {
    const attachmentId = parseObjectIdParam(req.params.id, "attachment");

    const attachment = await Attachment.findById(attachmentId);

    if (!attachment) {
      throw new HttpError(404, "Attachment not found.");
    }

    const viewer = getIkoshUser(req);
    const isManagement = isHseManagementRole(viewer.ikoshRole);
    const isOwner = String(attachment.uploadedBy) === String(viewer._id);

    if (!isManagement && attachment.entityType === "corrective_action") {
      // CAPA evidence visibility follows the action, not file ownership:
      // ordinary employees and unrelated HSE staff must not read it.
      let allowed = false;

      if (canViewCorrectiveActions(viewer.ikoshRole) && attachment.entityId) {
        const action = await CorrectiveAction.findById(attachment.entityId)
          .select("assignedTo site")
          .lean();

        if (action) {
          allowed = canAccessCorrectiveAction(viewer, action);
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    } else if (!isManagement && attachment.entityType === "inspection") {
      // Inspection evidence visibility follows the inspection, not file
      // ownership: unrelated HSE staff and ordinary employees must not read it.
      let allowed = false;

      if (canViewInspections(viewer.ikoshRole) && attachment.entityId) {
        const inspection = await Inspection.findById(attachment.entityId)
          .select("inspector site")
          .lean();

        if (inspection) {
          allowed = canAccessInspection(viewer, inspection);
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    } else if (!isManagement && attachment.entityType === "hse_audit") {
      // Audit evidence visibility follows the audit, not file ownership:
      // unrelated HSE staff and ordinary employees must not read it.
      let allowed = false;

      if (canViewAudits(viewer.ikoshRole) && attachment.entityId) {
        const audit = await HseAudit.findById(attachment.entityId)
          .select("auditors site")
          .lean();

        if (audit) {
          allowed = canAccessHseAudit(viewer, audit);
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    } else if (!isManagement && attachment.entityType === "permit") {
      // Permit evidence visibility follows the permit, not file ownership:
      // unrelated HSE staff and ordinary employees must not read it.
      let allowed = false;

      if (canViewPermits(viewer.ikoshRole) && attachment.entityId) {
        const permit = await Permit.findById(attachment.entityId)
          .select("site responsiblePerson createdBy")
          .lean();

        if (permit) {
          allowed = canAccessPermit(viewer, permit);
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    } else if (!isManagement && attachment.entityType === "risk_assessment") {
      // Risk-assessment evidence follows the assessment, not file ownership:
      // out-of-scope staff and ordinary employees must not read it.
      let allowed = false;

      if (
        canViewRiskAssessments(viewer.ikoshRole) &&
        attachment.entityId
      ) {
        const assessment = await RiskAssessment.findById(attachment.entityId)
          .select("site owner createdBy")
          .lean();

        if (assessment) {
          allowed = canAccessRiskAssessment(viewer, assessment);
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    } else if (!isManagement && attachment.entityType === "training_session") {
      // Training evidence follows the session, not file ownership: ordinary
      // employees cannot read attendance sheets or certificates in bulk.
      let allowed = false;

      if (canViewTraining(viewer.ikoshRole) && attachment.entityId) {
        const trainingSession = await TrainingSession.findById(
          attachment.entityId,
        )
          .select("site createdBy status")
          .lean();

        if (trainingSession) {
          allowed = canAccessTrainingSession(viewer, trainingSession);
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    } else if (!isManagement && attachment.entityType === "toolbox_talk") {
      // Talk evidence follows the talk, not file ownership.
      let allowed = false;

      if (canViewToolboxTalks(viewer.ikoshRole) && attachment.entityId) {
        const talk = await ToolboxTalk.findById(attachment.entityId)
          .select("site createdBy status")
          .lean();

        if (talk) {
          allowed = canAccessToolboxTalk(viewer, talk);
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    } else if (!isManagement && !isOwner) {
      let allowed = false;

      if (attachment.entityType === "site") {
        allowed = isSiteAssigned(viewer, attachment.entityId);
      } else if (
        attachment.entityType === "incident" &&
        attachment.entityId
      ) {
        const incident = await Incident.findById(attachment.entityId)
          .select("site reportedBy")
          .lean();

        if (incident) {
          // Evidence on a colleague's report is investigation material;
          // ordinary employees may only download evidence for their own.
          allowed = canAccessIncident(viewer, incident) &&
            (isManagementRole(viewer.ikoshRole) ||
              isIncidentReporter(viewer, incident));
        }
      }

      if (!allowed) {
        throw new HttpError(404, "Attachment not found.");
      }
    }

    let bytes: Buffer;

    try {
      bytes = await readAttachmentBytes(attachment.storageKey);
    } catch {
      throw new HttpError(404, "Attachment not found.");
    }

    if (sha256Hex(bytes) !== attachment.checksum) {
      throw new HttpError(409, "Attachment integrity verification failed.");
    }

    const filename = attachment.originalFilename.replace(/["\\]/g, "_");

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(bytes);
  },
);

export default router;
