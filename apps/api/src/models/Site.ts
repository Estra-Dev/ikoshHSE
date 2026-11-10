import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { SITE_STATUSES } from "../lib/hse-constants.js";

/**
 * A physical work location where HSE activity happens. Sites belong to
 * exactly one project. Site codes are globally unique so records can be
 * traced without resolving the project first.
 *
 * Site-level access control is driven by `User.assignedSites`; deleting a
 * site is blocked while employees or contractor personnel are attached to
 * it.
 */
const siteSchema = new Schema(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    location: {
      type: String,
      default: null,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: [...SITE_STATUSES],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type SiteDocument = InferSchemaType<typeof siteSchema>;

export const Site =
  (mongoose.models.Site as mongoose.Model<SiteDocument> | undefined) ??
  mongoose.model<SiteDocument>("Site", siteSchema);
