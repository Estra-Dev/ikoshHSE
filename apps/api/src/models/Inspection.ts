import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  INSPECTION_SEVERITIES,
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
} from "../lib/hse-constants.js";

/**
 * A finding recorded during an inspection. Findings are embedded because they
 * belong to a single inspection and are always read with it. A finding may be
 * linked to one corrective action; the link is written atomically by the
 * inspection routes so the two records cannot diverge.
 */
const inspectionFindingSchema = new Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: [...INSPECTION_SEVERITIES],
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
 * A scheduled HSE inspection at a project or site.
 *
 * Inspections start SCHEDULED and move forward through IN_PROGRESS to
 * COMPLETED; CANCELLED is the only other terminal state. The assigned
 * inspector (or HSE management) records findings and completion notes.
 */
const inspectionSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [...INSPECTION_TYPES],
      required: true,
    },
    status: {
      type: String,
      enum: [...INSPECTION_STATUSES],
      default: "SCHEDULED",
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
    inspector: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    findings: {
      type: [inspectionFindingSchema],
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
inspectionSchema.index({ status: 1, scheduledFor: -1 });
// Project-scoped reporting.
inspectionSchema.index({ project: 1, status: 1, scheduledFor: -1 });
// Site-scoped lists, which also back non-management visibility.
inspectionSchema.index({ site: 1, status: 1, scheduledFor: -1 });
// "My inspections" views for assigned inspectors.
inspectionSchema.index({ inspector: 1, status: 1, scheduledFor: -1 });

export type InspectionDocument = InferSchemaType<typeof inspectionSchema>;

export const Inspection =
  (mongoose.models.Inspection as
    | mongoose.Model<InspectionDocument>
    | undefined) ??
  mongoose.model<InspectionDocument>("Inspection", inspectionSchema);
