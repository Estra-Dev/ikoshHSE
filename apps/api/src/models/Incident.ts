import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "../lib/hse-constants.js";

/**
 * An incident or near-miss report filed against a physical site.
 *
 * Reporters supply only observational facts. Classification (`category`) and
 * workflow state (`status`) are management-controlled and start empty /
 * REPORTED so a report can never be self-classified or self-closed.
 */
const incidentSchema = new Schema(
  {
    site: {
      type: Schema.Types.ObjectId,
      ref: "Site",
      required: true,
      index: true,
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [...INCIDENT_TYPES],
      default: "INCIDENT",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      default: null,
      trim: true,
    },
    immediateActions: {
      type: String,
      default: null,
      trim: true,
    },
    // Management-only classification.
    category: {
      type: String,
      enum: [...INCIDENT_CATEGORIES],
      default: null,
    },
    status: {
      type: String,
      enum: [...INCIDENT_STATUSES],
      default: "REPORTED",
      index: true,
    },
    classifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    classifiedAt: {
      type: Date,
      default: null,
    },
    statusUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    statusUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

incidentSchema.index({ site: 1, status: 1, createdAt: -1 });
// Site-scoped incident lists and dashboard aggregates filter by site and
// order/range on occurredAt.
incidentSchema.index({ site: 1, occurredAt: -1 });
// Management-wide incident lists are ordered newest-occurred first.
incidentSchema.index({ occurredAt: -1, createdAt: -1 });

export type IncidentDocument = InferSchemaType<typeof incidentSchema>;

export const Incident =
  (mongoose.models.Incident as
    | mongoose.Model<IncidentDocument>
    | undefined) ??
  mongoose.model<IncidentDocument>("Incident", incidentSchema);
