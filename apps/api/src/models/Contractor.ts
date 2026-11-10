import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A contractor company engaged on one or more IKOSH projects. Contractors
 * are managed records only in this phase: contractor personnel have no
 * DigitAuth accounts; access control applies to IKOSH employees managing
 * the records.
 */
const contractorSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    registrationNumber: {
      type: String,
      default: null,
      trim: true,
    },
    trade: {
      type: String,
      default: null,
      trim: true,
    },
    contactName: {
      type: String,
      default: null,
      trim: true,
    },
    contactEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      default: null,
      trim: true,
    },
    // Projects this contractor is engaged on (HSE traceability).
    projects: {
      type: [Schema.Types.ObjectId],
      ref: "Project",
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Engaged-project lookups (e.g. blocking project deletion).
contractorSchema.index({ projects: 1 });

// Registration numbers must be unique once assigned; unassigned (null)
// values are excluded from this partial index so any number of contractors
// can be unregistered.
contractorSchema.index(
  { registrationNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { registrationNumber: { $type: "string" } },
  },
);

export type ContractorDocument = InferSchemaType<typeof contractorSchema>;

export const Contractor =
  (mongoose.models.Contractor as
    | mongoose.Model<ContractorDocument>
    | undefined) ??
  mongoose.model<ContractorDocument>("Contractor", contractorSchema);
