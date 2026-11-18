import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  PPE_CONDITIONS,
  PPE_ISSUANCE_STATUSES,
  WORKFORCE_PARTICIPANT_KINDS,
} from "../lib/hse-constants.js";

/**
 * One PPE issuance line. Employees and contractor personnel are separate
 * reference fields, never merged into a single identity. The name and
 * contractor reference are snapshots so history remains readable after a
 * personnel record is renamed, deactivated or reassigned.
 *
 * ISSUED is the only open state. RETURNED, REPLACED and LOST are terminal and
 * preserve the full issue/return lifecycle. Replacements create a new row with
 * `replacementFor` pointing at the previous issuance.
 */
const ppeIssuanceSchema = new Schema(
  {
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
    item: {
      type: Schema.Types.ObjectId,
      ref: "PpeItem",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: [...WORKFORCE_PARTICIPANT_KINDS],
      required: true,
      index: true,
    },
    employee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    contractorPersonnel: {
      type: Schema.Types.ObjectId,
      ref: "ContractorPersonnel",
      default: null,
    },
    contractor: {
      type: Schema.Types.ObjectId,
      ref: "Contractor",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    conditionAtIssue: {
      type: String,
      enum: [...PPE_CONDITIONS],
      required: true,
    },
    status: {
      type: String,
      enum: [...PPE_ISSUANCE_STATUSES],
      default: "ISSUED",
      required: true,
      index: true,
    },
    issuedOn: {
      type: Date,
      required: true,
      index: true,
    },
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
    },
    returnedOn: {
      type: Date,
      default: null,
    },
    returnedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    returnCondition: {
      type: String,
      enum: [...PPE_CONDITIONS, null],
      default: null,
    },
    returnNotes: {
      type: String,
      default: null,
      trim: true,
    },
    restocked: {
      type: Boolean,
      default: false,
      required: true,
    },
    lostOn: {
      type: Date,
      default: null,
    },
    lostBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lostNotes: {
      type: String,
      default: null,
      trim: true,
    },
    replacementFor: {
      type: Schema.Types.ObjectId,
      ref: "PpeIssuance",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

ppeIssuanceSchema.index({ site: 1, issuedOn: -1, createdAt: -1 });
ppeIssuanceSchema.index({ project: 1, issuedOn: -1, createdAt: -1 });
ppeIssuanceSchema.index({ employee: 1, issuedOn: -1 });
ppeIssuanceSchema.index({ contractorPersonnel: 1, issuedOn: -1 });
ppeIssuanceSchema.index({ item: 1, status: 1 });
ppeIssuanceSchema.index({ replacementFor: 1 });

export type PpeIssuanceDocument = InferSchemaType<typeof ppeIssuanceSchema>;

export const PpeIssuance =
  (mongoose.models.PpeIssuance as
    | mongoose.Model<PpeIssuanceDocument>
    | undefined) ??
  mongoose.model<PpeIssuanceDocument>("PpeIssuance", ppeIssuanceSchema);
