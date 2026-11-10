import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  EMPLOYMENT_TYPES,
  IKOSH_ROLES,
} from "../lib/ikosh-constants.js";

const userSchema = new Schema(
  {
    digitAuthUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    digitAuthApplicationId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      default: "",
      trim: true,
    },
    lastName: {
      type: String,
      default: "",
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // IKOSH employee information. None of these fields are written by the
    // DigitAuth webhook; they are managed by the Employee Management APIs.
    employeeId: {
      type: String,
      default: null,
      trim: true,
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    jobTitle: {
      type: String,
      default: null,
      trim: true,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
    },
    location: {
      type: String,
      default: null,
      trim: true,
    },
    hireDate: {
      type: Date,
      default: null,
    },
    employmentType: {
      type: String,
      enum: [...EMPLOYMENT_TYPES],
      default: null,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    ikoshRole: {
      type: String,
      enum: [...IKOSH_ROLES],
      default: "EMPLOYEE",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Sites the employee is assigned to, backing site-level access control
    // for HSE workflows. Managed through the site assignment endpoints.
    assignedSites: {
      type: [Schema.Types.ObjectId],
      ref: "Site",
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound index backing the employee directory's default filters.
userSchema.index({ department: 1, isActive: 1, lastName: 1 });

// Reverse lookup: who is assigned to a given site.
userSchema.index({ assignedSites: 1 });

// Employee IDs must be unique once assigned; unassigned (null) values are
// excluded from this partial index so any number of employees can be
// unassigned.
userSchema.index(
  { employeeId: 1 },
  {
    unique: true,
    partialFilterExpression: { employeeId: { $type: "string" } },
  },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User =
  (mongoose.models.User as mongoose.Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>("User", userSchema);
