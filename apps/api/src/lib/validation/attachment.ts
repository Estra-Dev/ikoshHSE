import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";

/** MIME types allowed for attachment upload. */
const ALLOWED_MIME_TYPES = [
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

export const attachmentSizeLimit = 10 * 1024 * 1024; // 10MB

/** Allows only specific MIME types to prevent malicious file uploads. */
function allowedMimeType() {
  return z.literal(ALLOWED_MIME_TYPES).optional();
}

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
    entityType: z.string().trim().optional(),
    entityId: objectIdSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;