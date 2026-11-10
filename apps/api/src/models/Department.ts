import mongoose, { Schema, type InferSchemaType } from "mongoose";

const departmentSchema = new Schema(
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
    head: {
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

export type DepartmentDocument = InferSchemaType<typeof departmentSchema>;

export const Department =
  (
    mongoose.models.Department as
      | mongoose.Model<DepartmentDocument>
      | undefined
  ) ?? mongoose.model<DepartmentDocument>("Department", departmentSchema);
