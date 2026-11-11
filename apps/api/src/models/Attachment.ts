import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Metadata for a securely stored evidence file. File bytes never live in
 * MongoDB: they are written through the attachment storage abstraction
 * (`lib/attachments/storage.ts`) under a randomized, server-generated
 * storage key, so client-supplied filenames can never influence the on-disk
 * path.
 *
 * `entityType`/`entityId` link attachments to HSE records (site or incident
 * evidence, and later action items); they stay null until an entity actually
 * claims the file.
 */
const attachmentSchema = new Schema(
  {
    storageKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Sanitized basename of the uploaded file (display only).
    originalFilename: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    // SHA-256 hex digest of the stored bytes (integrity verification).
    checksum: {
      type: String,
      required: true,
    },
    entityType: {
      type: String,
      default: null,
      trim: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Lookup of attachments linked to a given HSE record (site or incident).
attachmentSchema.index({ entityType: 1, entityId: 1 });

export type AttachmentDocument = InferSchemaType<typeof attachmentSchema>;

export const Attachment =
  (mongoose.models.Attachment as
    | mongoose.Model<AttachmentDocument>
    | undefined) ??
  mongoose.model<AttachmentDocument>("Attachment", attachmentSchema);
