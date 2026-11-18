import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { PPE_CATEGORIES, PPE_UNITS } from "../lib/hse-constants.js";

/**
 * Global PPE catalogue. Stock and issuance records reference an item, so
 * catalogue entries are deactivated rather than deleted to preserve history.
 *
 * The code is the stable business identifier; the size is kept as free text
 * because PPE sizing conventions differ by manufacturer and item type.
 */
const ppeItemSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [...PPE_CATEGORIES],
      required: true,
      index: true,
    },
    size: {
      type: String,
      default: null,
      trim: true,
    },
    unit: {
      type: String,
      enum: [...PPE_UNITS],
      required: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

ppeItemSchema.index({ isActive: 1, name: 1 });

export type PpeItemDocument = InferSchemaType<typeof ppeItemSchema>;

export const PpeItem =
  (mongoose.models.PpeItem as mongoose.Model<PpeItemDocument> | undefined) ??
  mongoose.model<PpeItemDocument>("PpeItem", ppeItemSchema);
