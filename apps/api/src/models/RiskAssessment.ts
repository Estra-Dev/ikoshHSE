import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  RISK_ASSESSMENT_STATUSES,
  RISK_LEVELS,
} from "../lib/hse-constants.js";

/**
 * A hazard line inside a risk assessment.
 *
 * Hazards are embedded because they belong to a single assessment and are
 * always read with it. Inherent and residual levels are stored as derived
 * snapshots of the 5×5 matrix; the routes recompute them on every write so
 * they can never drift from the scores.
 */
const riskHazardSchema = new Schema(
  {
    hazard: {
      type: String,
      required: true,
      trim: true,
    },
    consequences: {
      type: String,
      default: "",
      trim: true,
    },
    existingControls: {
      type: String,
      default: "",
      trim: true,
    },
    likelihood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    severity: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    inherentLevel: {
      type: String,
      enum: [...RISK_LEVELS],
      required: true,
    },
    residualLikelihood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    residualSeverity: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    residualLevel: {
      type: String,
      enum: [...RISK_LEVELS],
      required: true,
    },
    additionalControls: {
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
 * An HSE risk assessment for a project or site.
 *
 * Lifecycle: DRAFT → IN_REVIEW → APPROVED, with an explicit return to DRAFT
 * and an ARCHIVED terminal state. Content is editable only while DRAFT;
 * APPROVED and ARCHIVED assessments are immutable except for archiving.
 */
const riskAssessmentSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: [...RISK_ASSESSMENT_STATUSES],
      default: "DRAFT",
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
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reviewDate: {
      type: Date,
      default: null,
    },
    hazards: {
      type: [riskHazardSchema],
      default: [],
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    archivedAt: {
      type: Date,
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

// Register views: status queues and review scheduling.
riskAssessmentSchema.index({ status: 1, updatedAt: -1 });
// Project-scoped reporting.
riskAssessmentSchema.index({ project: 1, status: 1, updatedAt: -1 });
// Site-scoped lists, which also back non-management visibility.
riskAssessmentSchema.index({ site: 1, status: 1, updatedAt: -1 });
// "My assessments" views for owners.
riskAssessmentSchema.index({ owner: 1, status: 1, updatedAt: -1 });

export type RiskAssessmentDocument = InferSchemaType<
  typeof riskAssessmentSchema
>;

export const RiskAssessment =
  (mongoose.models.RiskAssessment as
    | mongoose.Model<RiskAssessmentDocument>
    | undefined) ??
  mongoose.model<RiskAssessmentDocument>(
    "RiskAssessment",
    riskAssessmentSchema,
  );
