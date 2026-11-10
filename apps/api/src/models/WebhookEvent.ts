import mongoose, { Schema, type InferSchemaType } from "mongoose";

const webhookEventSchema = new Schema(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["PROCESSING", "PROCESSED", "FAILED"],
      default: "PROCESSING",
      required: true,
    },

    attempts: {
      type: Number,
      default: 1,
      min: 1,
    },

    processingToken: {
      type: String,
      default: null,
      select: false,
    },

    processingStartedAt: {
      type: Date,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type WebhookEventDocument = InferSchemaType<typeof webhookEventSchema>;

export const WebhookEvent =
  (mongoose.models.WebhookEvent as
    | mongoose.Model<WebhookEventDocument>
    | undefined) ??
  mongoose.model<WebhookEventDocument>("WebhookEvent", webhookEventSchema);
