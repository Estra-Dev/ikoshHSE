import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  CORRECTIVE_ACTION_SOURCES,
  CORRECTIVE_ACTION_STATUSES,
} from "../lib/hse-constants.js";

/**
 * A corrective action following up an HSE issue.
 *
 * Incident and near-miss actions carry the originating report; the API derives
 * `project` and `site` from that report so provenance cannot be rewritten.
 * Manual actions are tied to a project and optionally a site.
 *
 * Workflow state is forward-only (`OPEN → IN_PROGRESS → COMPLETED → VERIFIED`)
 * and only HSE management may verify closure.
 */
const correctiveActionSchema = new Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      enum: [...CORRECTIVE_ACTION_SOURCES],
      required: true,
    },
    incident: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
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
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: [...CORRECTIVE_ACTION_STATUSES],
      default: "OPEN",
      required: true,
      index: true,
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
    verificationNotes: {
      type: String,
      default: null,
      trim: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

// Register and dashboard-style views: due/overdue work per status.
correctiveActionSchema.index({ status: 1, dueDate: 1 });
// Project-scoped reporting.
correctiveActionSchema.index({ project: 1, status: 1 });
// Site-scoped lists, which are also the basis of non-management visibility.
correctiveActionSchema.index({ site: 1, status: 1, dueDate: 1 });
// "My actions" views for assignees.
correctiveActionSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
// Reverse lookup of actions raised from a report.
correctiveActionSchema.index({ incident: 1 });

export type CorrectiveActionDocument = InferSchemaType<
  typeof correctiveActionSchema
>;

export const CorrectiveAction =
  (mongoose.models.CorrectiveAction as
    | mongoose.Model<CorrectiveActionDocument>
    | undefined) ??
  mongoose.model<CorrectiveActionDocument>(
    "CorrectiveAction",
    correctiveActionSchema,
  );
