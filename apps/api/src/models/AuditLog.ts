import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Append-only audit trail for HSE operational data.
 *
 * Integrity rules:
 * - No update or delete endpoints exist for this collection; records are
 *   only ever inserted via `recordAuditLog`.
 * - `before`/`after` snapshots contain only explicitly whitelisted fields
 *   chosen at the call site, never raw Mongo documents.
 * - `updatedAt` is intentionally disabled so documents cannot silently
 *   change after being written.
 */
const auditLogSchema = new Schema(
  {
    actor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Dotted event name, e.g. "project.created".
    action: {
      type: String,
      required: true,
      trim: true,
    },
    // Entity collection name, e.g. "Project".
    entityType: {
      type: String,
      required: true,
      trim: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    before: {
      type: Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;

export const AuditLog =
  (mongoose.models.AuditLog as
    | mongoose.Model<AuditLogDocument>
    | undefined) ??
  mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema);
