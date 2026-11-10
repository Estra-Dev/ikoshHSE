import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { PROJECT_STATUSES } from "../lib/hse-constants.js";

/**
 * An EPC project (client engagement) that HSE records are traced against.
 * Sites belong to projects; incidents, observations and permits belong to
 * sites. Deleting a project is blocked while it still has sites.
 */
const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    client: {
      type: String,
      default: null,
      trim: true,
    },
    location: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: [...PROJECT_STATUSES],
      default: "ACTIVE",
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type ProjectDocument = InferSchemaType<typeof projectSchema>;

export const Project =
  (mongoose.models.Project as
    | mongoose.Model<ProjectDocument>
    | undefined) ??
  mongoose.model<ProjectDocument>("Project", projectSchema);
