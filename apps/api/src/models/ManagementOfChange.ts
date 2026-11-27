import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const MOC_STATUSES = [
  "DRAFT",
  "ASSESSMENT",
  "PENDING_APPROVAL",
  "APPROVED",
  "IMPLEMENTING",
  "VERIFICATION",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;

const approvalSchema = new Schema(
  {
    approvalType: {
      type: String,
      enum: ["TECHNICAL", "MANAGEMENT"],
      required: true,
    },
    approver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorityBasis: {
      type: String,
      required: true,
      trim: true,
    },
    decision: {
      type: String,
      enum: ["APPROVED", "REJECTED"],
      required: true,
    },
    comments: {
      type: String,
      default: "",
      trim: true,
    },
    decidedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: false, versionKey: false },
);

const managementOfChangeSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    scope: {
      type: String,
      required: true,
      trim: true,
    },
    changeType: {
      type: String,
      enum: ["TEMPORARY", "PERMANENT"],
      required: true,
    },
    plannedStartAt: {
      type: Date,
      default: null,
    },
    plannedEndAt: {
      type: Date,
      default: null,
    },
    affectedAssets: {
      type: [String],
      default: [],
    },
    affectedPeople: {
      type: [String],
      default: [],
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
    changeOwner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
    status: {
      type: String,
      enum: [...MOC_STATUSES],
      default: "DRAFT",
      required: true,
      index: true,
    },
    impactAssessment: {
      qhseRisks: { type: String, default: "" },
      environmentalAspects: { type: String, default: "" },
      legalAndClientObligations: { type: String, default: "" },
      competenceRequirements: { type: String, default: "" },
      procedureChanges: { type: String, default: "" },
      emergencyArrangements: { type: String, default: "" },
      interfaces: { type: String, default: "" },
      riskAssessment: {
        type: Schema.Types.ObjectId,
        ref: "RiskAssessment",
        default: null,
      },
    },
    implementationPlan: {
      controls: { type: String, default: "" },
      testingPlan: { type: String, default: "" },
      communicationPlan: { type: String, default: "" },
      rollbackPlan: { type: String, default: "" },
      updatedDocuments: { type: [String], default: [] },
      briefingCompleted: { type: Boolean, default: false },
      briefingAt: { type: Date, default: null },
    },
    approvals: {
      type: [approvalSchema],
      default: [],
    },
    verification: {
      findings: { type: String, default: "" },
      testingCompleted: { type: Boolean, default: false },
      inspectionCompleted: { type: Boolean, default: false },
      actionsClosed: { type: Boolean, default: false },
      verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      verifiedAt: { type: Date, default: null },
    },
    emergencyChange: {
      type: Boolean,
      default: false,
    },
    emergencyReviewAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    closedAt: {
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

managementOfChangeSchema.index({ project: 1, status: 1, updatedAt: -1 });
managementOfChangeSchema.index({ site: 1, status: 1, updatedAt: -1 });
managementOfChangeSchema.index({ changeOwner: 1, status: 1, updatedAt: -1 });

export type ManagementOfChangeDocument = InferSchemaType<
  typeof managementOfChangeSchema
>;

export const ManagementOfChange =
  (mongoose.models.ManagementOfChange as
    | mongoose.Model<ManagementOfChangeDocument>
    | undefined) ??
  mongoose.model<ManagementOfChangeDocument>(
    "ManagementOfChange",
    managementOfChangeSchema,
  );
