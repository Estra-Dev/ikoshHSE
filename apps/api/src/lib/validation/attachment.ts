import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";

/** MIME types allowed for attachment upload. */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "text/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const attachmentSizeLimit = 10 * 1024 * 1024; // 10MB

/** Entity types an attachment may be linked to in Phase 1. */
export const ATTACHMENT_ENTITY_TYPES = ["site", "incident"] as const;

export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/**
 * Multipart upload fields. The file itself arrives separately via multer; the
 * checksum is optional because the server always recalculates it, but when the
 * client supplies one it must match the stored bytes.
 */
export const attachmentUploadFieldsSchema = z
  .object({
    entityType: z.enum(ATTACHMENT_ENTITY_TYPES).optional(),
    entityId: objectIdSchema.optional(),
    description: z.string().trim().max(500).optional(),
    checksum: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-f0-9]{64}$/, "Invalid checksum format.")
      .optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.entityType) === Boolean(value.entityId),
    "entityType and entityId must be provided together.",
  );

export type AttachmentUploadFields = z.infer<
  typeof attachmentUploadFieldsSchema
>;

export const createAttachmentSchema = z.object({
  originalFilename: trimmedNonEmptyString(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().min(0).max(attachmentSizeLimit),
  checksum: z.string().length(64), // SHA-256 hex length
  entityType: z.string().trim().optional(),
  entityId: objectIdSchema.optional(),
  description: z.string().trim().max(500).optional(),
});

export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;

export const updateAttachmentSchema = z
  .object({
    description: z.string().trim().max(500).optional(),
    entityType: z.enum(ATTACHMENT_ENTITY_TYPES).optional(),
    entityId: objectIdSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  })
  .refine(
    (value) =>
      Boolean(value.entityType) === Boolean(value.entityId) ||
      (value.entityType === undefined && value.entityId === undefined),
    "entityType and entityId must be provided together.",
  );

export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;
