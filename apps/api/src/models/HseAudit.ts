import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  AUDIT_CHECKLIST_RESULTS,
  AUDIT_FINDING_SEVERITIES,
  AUDIT_STATUSES,
  AUDIT_TYPES,
} from "../lib/hse-constants.js";

/**
 * One checklist question recorded during a scheduled audit. Results start
 * PENDING and are filled in while the audit is conducted. Checklist text and
 * notes are business data, but audit snapshots deliberately exclude them.
 */
const auditChecklistItemSchema = new Schema(
  {
    item: {
      type: String,
      required: true,
      trim: true,
    },
    result: {
      type: String,
      enum: [...AUDIT_CHECKLIST_RESULTS],
      default: "PENDING",
      required: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

/**
 * A finding recorded during an audit. Findings are embedded because they
 * belong to a single audit and are always read with it. A finding may be linked
 * to one corrective action; the link is written atomically by the audit routes
 * so the two records cannot diverge.
 */
const auditFindingSchema = new Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: [...AUDIT_FINDING_SEVERITIES],
      required: true,
    },
    recommendation: {
      type: String,
      default: null,
      trim: true,
    },
    correctiveAction: {
      type: Schema.Types.ObjectId,
      ref: "CorrectiveAction",
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

/**
 * A scheduled HSE audit at a project or site.
 *
 * Audits start PLANNED and move forward through IN_PROGRESS to COMPLETED;
 * CANCELLED is the only other terminal state. Multiple auditors share
 * responsibility for recording checklist results, findings and completion
 * notes. Each linked corrective action derives its project and site from this
 * audit.
 */
const hseAuditSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [...AUDIT_TYPES],
      required: true,
    },
    status: {
      type: String,
      enum: [...AUDIT_STATUSES],
      default: "PLANNED",
      required: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    site: {
      type: Schema.Types.ObjectId,
      ref: "Site",
      default: null,
    },
    auditors: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
      index: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    completionNotes: {
      type: String,
      default: null,
      trim: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    checklist: {
      type: [auditChecklistItemSchema],
      default: [],
    },
    findings: {
      type: [auditFindingSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Register views: upcoming schedule and status filters.
hseAuditSchema.index({ status: 1, scheduledFor: -1 });
// Project-scoped reporting.
hseAuditSchema.index({ project: 1, status: 1, scheduledFor: -1 });
// Site-scoped lists, which also back non-management visibility.
hseAuditSchema.index({ site: 1, status: 1, scheduledFor: -1 });
// "My audits" views for assigned auditors.
hseAuditSchema.index({ auditors: 1, status: 1, scheduledFor: -1 });

export type HseAuditDocument = InferSchemaType<typeof hseAuditSchema>;

export const HseAudit =
  (mongoose.models.HseAudit as
    | mongoose.Model<HseAuditDocument>
    | undefined) ??
  mongoose.model<HseAuditDocument>("HseAudit", hseAuditSchema);
