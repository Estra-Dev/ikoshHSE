import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { TOOLBOX_TALK_STATUSES } from "../lib/hse-constants.js";
import { participantFields } from "./participant.js";

/**
 * A participant on a toolbox talk. Acknowledgement records that the person
 * confirmed the briefing; it is not a competency or authorization claim.
 */
const toolboxTalkParticipantSchema = new Schema(
  {
    ...participantFields,
    acknowledged: {
      type: Boolean,
      default: false,
      required: true,
    },
    acknowledgedAt: {
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
 * A toolbox talk delivered at a project site.
 *
 * Lifecycle: SCHEDULED → COMPLETED | CANCELLED. Content and attendance may only
 * change while the talk is scheduled; terminal talks are immutable so
 * acknowledgement evidence cannot be rewritten.
 */
const toolboxTalkSchema = new Schema(
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
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    discussionPoints: {
      type: String,
      default: "",
      trim: true,
    },
    // Facilitators are frequently supervisors or external speakers who do not
    // need an IKOSH account, so only the recorded name is stored.
    facilitatorName: {
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
      enum: [...TOOLBOX_TALK_STATUSES],
      default: "SCHEDULED",
      required: true,
      index: true,
    },
    participants: {
      type: [toolboxTalkParticipantSchema],
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

// Register ordering, filters and deletion guards.
toolboxTalkSchema.index({ status: 1, scheduledDate: -1 });
toolboxTalkSchema.index({ site: 1, scheduledDate: -1 });
toolboxTalkSchema.index({ project: 1, scheduledDate: -1 });
// Personnel history lookups by participant reference.
toolboxTalkSchema.index({ "participants.employee": 1 });
toolboxTalkSchema.index({ "participants.contractorPersonnel": 1 });

export type ToolboxTalkDocument = InferSchemaType<typeof toolboxTalkSchema>;

export const ToolboxTalk =
  (mongoose.models.ToolboxTalk as
    | mongoose.Model<ToolboxTalkDocument>
    | undefined) ??
  mongoose.model<ToolboxTalkDocument>("ToolboxTalk", toolboxTalkSchema);
