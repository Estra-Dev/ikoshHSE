import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * An individual working for a contractor company. Personnel records carry
 * the contractor's own badge/personnel number (unique within the
 * contractor) and optionally the site they are currently deployed to, so
 * incidents involving contractor staff can be traced to both the company
 * and the workplace.
 */
const contractorPersonnelSchema = new Schema(
  {
    contractor: {
      type: Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    // Contractor-issued badge/personnel number.
    personnelId: {
      type: String,
      default: null,
      trim: true,
    },
    jobTitle: {
      type: String,
      default: null,
      trim: true,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    // Current deployment site, for traceability and site filtering.
    site: {
      type: Schema.Types.ObjectId,
      ref: "Site",
      default: null,
      index: true,
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

// A contractor's personnel numbers must be unique within that contractor;
// unassigned (null) values are excluded so personnel without badges can
// coexist.
contractorPersonnelSchema.index(
  { contractor: 1, personnelId: 1 },
  {
    unique: true,
    partialFilterExpression: { personnelId: { $type: "string" } },
  },
);

export type ContractorPersonnelDocument = InferSchemaType<
  typeof contractorPersonnelSchema
>;

export const ContractorPersonnel =
  (mongoose.models.ContractorPersonnel as
    | mongoose.Model<ContractorPersonnelDocument>
    | undefined) ??
  mongoose.model<ContractorPersonnelDocument>(
    "ContractorPersonnel",
    contractorPersonnelSchema,
  );
