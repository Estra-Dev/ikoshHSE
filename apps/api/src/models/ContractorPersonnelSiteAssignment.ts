import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * A historical record of contractor personnel being deployed to a site.
 *
 * Assignments are never hard-deleted: ending one sets `isActive` to false and
 * records `endedAt`/`endedBy`, preserving the full deployment history.
 *
 * `assignedBy` and `endedBy` are nullable so legacy records backfilled from
 * the old `ContractorPersonnel.site` field can be represented even though the
 * original responsible user is unknown.
 */
const contractorPersonnelSiteAssignmentSchema = new Schema(
  {
    personnel: {
      type: Schema.Types.ObjectId,
      ref: "ContractorPersonnel",
      required: true,
    },
    contractor: {
      type: Schema.Types.ObjectId,
      ref: "Contractor",
      required: true,
    },
    site: {
      type: Schema.Types.ObjectId,
      ref: "Site",
      required: true,
    },
    assignedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

// A person may only have one active assignment per site. Ended assignments
// are excluded from the constraint so re-assignment creates a new history row.
contractorPersonnelSiteAssignmentSchema.index(
  { personnel: 1, site: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  },
);

// History and eligibility lookups.
contractorPersonnelSiteAssignmentSchema.index({ personnel: 1, endedAt: -1 });
contractorPersonnelSiteAssignmentSchema.index({ contractor: 1, isActive: 1 });
contractorPersonnelSiteAssignmentSchema.index({ site: 1, isActive: 1 });

export type ContractorPersonnelSiteAssignmentDocument = InferSchemaType<
  typeof contractorPersonnelSiteAssignmentSchema
>;

export const ContractorPersonnelSiteAssignment =
  (mongoose.models.ContractorPersonnelSiteAssignment as
    | mongoose.Model<ContractorPersonnelSiteAssignmentDocument>
    | undefined) ??
  mongoose.model<ContractorPersonnelSiteAssignmentDocument>(
    "ContractorPersonnelSiteAssignment",
    contractorPersonnelSiteAssignmentSchema,
  );
