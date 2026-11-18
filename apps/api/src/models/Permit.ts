import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  PERMIT_PRECAUTIONS,
  PERMIT_STATUSES,
  PERMIT_TO_WORK_TYPES,
} from "../lib/hse-constants.js";

/**
 * A hazard identified for the permitted work, together with the controls that
 * make the job safe. Hazards are embedded because they are always read with
 * the permit and never independently referenced.
 */
const permitHazardSchema = new Schema(
  {
    hazard: {
      type: String,
      required: true,
      trim: true,
    },
    controlMeasures: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

/**
 * Confirmed close-out checks. Closure is only allowed once every check is
 * true, so a permit cannot be signed off while the work area is still live.
 */
const permitClosureChecksSchema = new Schema(
  {
    workAreaSecured: {
      type: Boolean,
      default: false,
    },
    personnelAccountedFor: {
      type: Boolean,
      default: false,
    },
    equipmentIsolated: {
      type: Boolean,
      default: false,
    },
    siteHandoverCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
    timestamps: false,
    versionKey: false,
  },
);

/**
 * A permit to work on a specific project site.
 *
 * Lifecycle: DRAFT → SUBMITTED → APPROVED → ACTIVE → SUSPENDED/RESUMED →
 * CLOSED, with REJECTED and CANCELLED as terminal alternatives. Content is
 * editable only while DRAFT; every lifecycle change is written by the routes
 * with an audit row in the same transaction.
 */
const permitSchema = new Schema(
  {
    workDescription: {
      type: String,
      required: true,
      trim: true,
    },
    workType: {
      type: String,
      enum: [...PERMIT_TO_WORK_TYPES],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [...PERMIT_STATUSES],
      default: "DRAFT",
      required: true,
    },
    // Readiness policy in force when the permit was created. `null` marks a
    // permit created before policy activation; it is grandfathered and is
    // never stamped later. Server-controlled: the value is set only by the
    // create route and is immutable after the document exists.
    policyVersion: {
      type: Number,
      default: null,
      immutable: true,
      index: true,
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
      required: true,
      index: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validTo: {
      type: Date,
      required: true,
    },
    responsiblePerson: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Free-text worker names/roles: contractor crews usually have no IKOSH
    // accounts, so the permit records who is covered without granting access.
    workersInvolved: {
      type: [String],
      default: [],
    },
    requiredPrecautions: {
      type: [{ type: String, enum: [...PERMIT_PRECAUTIONS] }],
      default: [],
    },
    hazards: {
      type: [permitHazardSchema],
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
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    activatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    resumedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resumedAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledAt: {
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
    // Free-text explanations are displayed on the permit but deliberately
    // excluded from audit snapshots.
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
    suspensionReason: {
      type: String,
      default: null,
      trim: true,
    },
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
    },
    closureNotes: {
      type: String,
      default: null,
      trim: true,
    },
    closureChecks: {
      type: permitClosureChecksSchema,
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

// Defence in depth on top of the schema's `immutable` option: an existing
// permit's policyVersion can never be reassigned, including during a link or
// content edit. Only document creation may set it.
permitSchema.pre("save", function () {
  if (!this.isNew && this.isModified("policyVersion")) {
    throw new Error("Permit policyVersion is immutable after creation.");
  }
});

// Register queues and expiry reporting.
permitSchema.index({ status: 1, validTo: 1, createdAt: -1 });
// Project-scoped reporting and the deletion guard.
permitSchema.index({ project: 1, status: 1, updatedAt: -1 });
// Site-scoped lists, which also back non-management visibility.
permitSchema.index({ site: 1, status: 1, updatedAt: -1 });
// "My permits" views for responsible people.
permitSchema.index({ responsiblePerson: 1, status: 1, updatedAt: -1 });

export type PermitDocument = InferSchemaType<typeof permitSchema>;

export const Permit =
  (mongoose.models.Permit as mongoose.Model<PermitDocument> | undefined) ??
  mongoose.model<PermitDocument>("Permit", permitSchema);
