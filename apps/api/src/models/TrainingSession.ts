import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { TRAINING_SESSION_STATUSES } from "../lib/hse-constants.js";
import { participantFields } from "./participant.js";

/**
 * A participant on a training session. Attendance is recorded per person and
 * completion is a factual record of that attendance, not an assertion that the
 * person is competent. Certificate details are optional and only stored when
 * the HSE team recorded them.
 */
const trainingParticipantSchema = new Schema(
  {
    ...participantFields,
    completed: {
      type: Boolean,
      default: false,
      required: true,
    },
    certificateNumber: {
      type: String,
      default: null,
      trim: true,
    },
    certificateIssuedOn: {
      type: Date,
      default: null,
    },
    certificateExpiresOn: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

/**
 * A scheduled HSE training session at a project site.
 *
 * Lifecycle: SCHEDULED → COMPLETED | CANCELLED. Content and attendance may only
 * change while the session is scheduled; terminal sessions are immutable so
 * attendance history cannot be rewritten after the fact.
 */
const trainingSessionSchema = new Schema(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "TrainingCourse",
      required: true,
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
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    // Trainer is recorded as a name: trainers are often external and do not
    // need an IKOSH account.
    trainerName: {
      type: String,
      required: true,
      trim: true,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: [...TRAINING_SESSION_STATUSES],
      default: "SCHEDULED",
      required: true,
      index: true,
    },
    participants: {
      type: [trainingParticipantSchema],
      default: [],
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    completedAt: {
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
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
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

// Register ordering and filters.
trainingSessionSchema.index({ status: 1, scheduledDate: -1 });
trainingSessionSchema.index({ site: 1, scheduledDate: -1 });
trainingSessionSchema.index({ project: 1, scheduledDate: -1 });
// Personnel history lookups by participant reference.
trainingSessionSchema.index({ "participants.employee": 1 });
trainingSessionSchema.index({ "participants.contractorPersonnel": 1 });

export type TrainingSessionDocument = InferSchemaType<
  typeof trainingSessionSchema
>;

export const TrainingSession =
  (mongoose.models.TrainingSession as
    | mongoose.Model<TrainingSessionDocument>
    | undefined) ??
  mongoose.model<TrainingSessionDocument>(
    "TrainingSession",
    trainingSessionSchema,
  );
