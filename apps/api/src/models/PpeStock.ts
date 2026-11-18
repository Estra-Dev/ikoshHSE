import mongoose, { Schema, type InferSchemaType } from "mongoose";

/**
 * Current PPE stock for one catalogue item at one site.
 *
 * Quantities are always non-negative; routes decrement atomically with a
 * `quantityOnHand >= quantity` guard so concurrent issuances cannot oversell
 * stock. Stock rows are adjusted, never deleted, so site and project deletion
 * guards can preserve inventory history.
 */
const ppeStockSchema = new Schema(
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
    item: {
      type: Schema.Types.ObjectId,
      ref: "PpeItem",
      required: true,
      index: true,
    },
    quantityOnHand: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    minimumQuantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    updatedBy: {
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

// One stock row per item per site; concurrent creates are rejected by Mongo.
ppeStockSchema.index({ site: 1, item: 1 }, { unique: true });
ppeStockSchema.index({ site: 1, quantityOnHand: 1 });
ppeStockSchema.index({ project: 1, site: 1 });

export type PpeStockDocument = InferSchemaType<typeof ppeStockSchema>;

export const PpeStock =
  (mongoose.models.PpeStock as mongoose.Model<PpeStockDocument> | undefined) ??
  mongoose.model<PpeStockDocument>("PpeStock", ppeStockSchema);
