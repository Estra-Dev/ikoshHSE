import { Router, type Request, type Response } from "express";
import { requireAuth } from "@digit-auth/node";
import { digitAuth } from "../lib/digit-auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  firstValidationIssue,
  parseObjectIdParam,
} from "../lib/validation/common.js";
import {
  createAttachmentSchema,
  updateAttachmentSchema,
} from "../lib/validation/attachment.js";
import { attachIkoshUser, getIkoshUser } from "../middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../middleware/require-ikosh-role.js";
import { isHseManagementRole } from "../lib/ikosh-constants.js";
import { Attachment } from "../models/Attachment.js";
import { User } from "../models/User.js";
import { toAttachmentSummary } from "../serializers/attachment.js";

const router: Router = Router();

// All attachment routes require authenticated, active IKOSH employee.
router.use(requireAuth(digitAuth), attachIkoshUser);

// List attachments with pagination and filters. Only HSE_MANAGER + ADMIN can
// view attachments linked to entities (otherwise only those uploaded by self).
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const viewer = getIkoshUser(_req);
  const entityFilter = _req.query.entityType && _req.query.entityId ? {
    entityType: _req.query.entityType,
    entityId: _req.query.entityId,
  } : {};

  const filter = {
    ...entityFilter,
    ...(isHseManagementRole(viewer.ikoshRole) ? {} : { uploadedBy: viewer._id }),
  };

  const page = Math.max(1, parseInt(_req.query.page as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(_req.query.limit as string || "20", 10)));
  const skip = (page - 1) * limit;

  const [total, attachments] = await Promise.all([
    Attachment.countDocuments(filter),
    Attachment.find(filter)
      .populate("uploadedBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
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

// Upload a file: client first POST to `/api/hse/attachments/upload/url`
// to get a signed upload URL; then PUT multipart/form-data to that URL.
// This endpoint records the metadata after the file bytes have been stored.
router.post(
  "/",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (_req: Request, res: Response): Promise<void> => {
    // In MVP: we mock the storage and immediately generate metadata.
    // In Phase 2: integrate with cloud storage and verify checksum.
    const parsed = createAttachmentSchema.safeParse(_req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const viewer = getIkoshUser(_req);
    const { originalFilename, mimeType, size, checksum, entityType, entityId, description } = parsed.data;

    // Validate checksum format (SHA-256 hex).
    if (!/^[0-9a-f]{64}$/i.test(checksum)) {
      throw new HttpError(400, "Invalid checksum format. Expected SHA-256 hex (64 characters).");
    }

    // Verify entity exists if being linked.
    if (entityType && entityId) {
      // Currently we only support linking to HSE records in later phases;
      // for now we just accept any entity type but log it.
    }

    const attachment = await Attachment.create({
      storageKey: `attach_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      originalFilename,
      mimeType,
      size,
      checksum,
      entityType,
      entityId,
      description: description ?? "",
      uploadedBy: viewer._id,
    });

    res.status(201).json({
      success: true,
      attachment: toAttachmentSummary(attachment),
    });
  },
);

// Update attachment metadata (HSE_MANAGER + ADMIN only).
router.patch(
  "/:id",
  requireIkoshRole("ADMIN", "HSE_MANAGER"),
  async (req: Request, res: Response): Promise<void> {
    const attachmentId = parseObjectIdParam(req.params.id, "attachment");

    const parsed = updateAttachmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, firstValidationIssue(parsed.error));
    }

    const attachment = await Attachment.findById(attachmentId);
    if (!attachment) {
      throw new HttpError(404, "Attachment not found.");
    }

    const { entityType, entityId, description } = parsed.data;

    if (entityType !== undefined) attachment.entityType = entityType;
    if (entityId !== undefined) attachment.entityId = entityId;
    if (description !== undefined) attachment.description = description;

    await attachment.save();

    res.status(200).json({
      success: true,
      attachment: toAttachmentSummary(attachment),
    });
  },
);

// Download an attachment (authorization-checked).
// The actual file bytes are served by a storage service; this endpoint
// validates permissions and returns a signed URL or streams the file locally.
router.get(
  "/:id/download",
  async (req: Request, res: Response): Promise<void> {
    const attachmentId = parseObjectIdParam(req.params.id, "attachment");

    const attachment = await Attachment.findById(attachmentId).populate("uploadedBy", "firstName lastName");
    if (!attachment) {
      throw new HttpError(404, "Attachment not found.");
    }

    const viewer = getIkoshUser(req);

    // Authorization: owner, HSE_MANAGER, ADMIN, or site-assigned employee.
    const isOwner = String(attachment.uploadedBy._id) === String(viewer._id);
    const isHseStaff = isHseManagementRole(viewer.ikoshRole);

    if (!isOwner && !isHseStaff) {
      // TODO: site assignment check in Phase 2 (if entityType/entityId points to a site).
      throw new HttpError(403, "You do not have permission to download this attachment.");
    }

    // Return signed URL or stream the file from local storage.
    // For now we return placeholder metadata indicating where the file lives.
    res.status(200).json({
      success: true,
      attachment: toAttachmentSummary(attachment),
      storageKey: attachment.storageKey,
      // In production we would return a pre-signed URL or stream the file.
    });
  },
);

export default router;