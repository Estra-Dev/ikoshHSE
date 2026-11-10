import type { AttachmentDocument } from "../models/Attachment.js";

/** Minimal document shape required to serialize an attachment. */
export type AttachmentLike = AttachmentDocument & { _id: unknown };

export interface SerializedAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
  entityType: string | null;
  entityId: string | null;
  description: string;
  uploadedBy: { id: string };
  createdAt: string;
}

/** Whitelists attachment response fields and converts the Mongo document to a JSON-safe shape. */
export function toAttachmentSummary(
  attachment: AttachmentLike,
): SerializedAttachment {
  return {
    id: String(attachment._id),
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    checksum: attachment.checksum,
    entityType: attachment.entityType ?? null,
    entityId: attachment.entityId ? String(attachment.entityId) : null,
    description: attachment.description ?? "",
    uploadedBy: { id: String(attachment.uploadedBy) },
    createdAt: attachment.createdAt.toISOString(),
  };
}