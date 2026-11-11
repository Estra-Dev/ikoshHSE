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
import { isHseManagementRole } from "../lib/ikosh-constants.js";
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
import { Incident } from "../models/Incident.js";
import { Site } from "../models/Site.js";
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
  viewer: SiteScopedViewer,
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

    assertSiteAccess(viewer, incident.site);
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
  const incidentIds =
    assignedSites.length > 0
      ? await Incident.distinct("_id", { site: { $in: assignedSites } })
      : [];

  return {
    $or: [
      { uploadedBy: viewer._id },
      { entityType: "site", entityId: { $in: assignedSites } },
      {
        entityType: "incident",
        entityId: { $in: incidentIds },
      },
    ],
  };
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
    const isOwner = String(attachment.uploadedBy) === String(viewer._id);

    if (!isHseManagementRole(viewer.ikoshRole) && !isOwner) {
      let siteId: unknown = null;

      if (attachment.entityType === "site") {
        siteId = attachment.entityId;
      } else if (
        attachment.entityType === "incident" &&
        attachment.entityId
      ) {
        const incident = await Incident.findById(attachment.entityId)
          .select("site")
          .lean();
        siteId = incident?.site ?? null;
      }

      if (!siteId || !isSiteAssigned(viewer, siteId)) {
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
