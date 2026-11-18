import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  RISK_ASSESSMENT_STATUSES,
  RISK_LEVELS,
  RISK_REVIEW_TRIGGERS,
} from "../lib/hse-constants.js";

/**
 * One ordered task step in a job hazard analysis. Steps are embedded and
 * referenced by hazards through `taskStepId`; legacy assessments without steps
 * keep hazards unassigned.
 */
const riskTaskStepSchema = new Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

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
    // Links the hazard to one task step. Null keeps legacy/general hazards
    // working without a migration.
    taskStepId: {
      type: Schema.Types.ObjectId,
      default: null,
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
    taskSteps: {
      type: [riskTaskStepSchema],
      default: [],
    },
    // Controlled revision metadata. A revision is a new document; prior
    // revisions are never overwritten. `isCurrent` is derived by the API as
    // status APPROVED with `supersededBy` null.
    revision: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    lineageId: {
      type: Schema.Types.ObjectId,
      ref: "RiskAssessment",
      default: null,
    },
    supersedes: {
      type: Schema.Types.ObjectId,
      ref: "RiskAssessment",
      default: null,
    },
    supersededBy: {
      type: Schema.Types.ObjectId,
      ref: "RiskAssessment",
      default: null,
    },
    supersededAt: {
      type: Date,
      default: null,
    },
    reviewTrigger: {
      type: String,
      enum: [...RISK_REVIEW_TRIGGERS],
      default: null,
    },
    reviewTriggerIncident: {
      type: Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
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
// Revision history for one controlled lineage.
riskAssessmentSchema.index({ lineageId: 1, revision: -1 });
// Reverse lookup of the revision that superseded a document.
riskAssessmentSchema.index({ supersededBy: 1 });

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
