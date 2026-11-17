import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { TRAINING_COURSE_CATEGORIES } from "../lib/hse-constants.js";

/**
 * A reusable training course/type in the HSE catalogue.
 *
 * Courses are global reference data rather than site-bound records. They are
 * never hard-deleted: deactivating hides a course from new sessions while
 * preserving every historical session that references it.
 */
const trainingCourseSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [...TRAINING_COURSE_CATEGORIES],
      required: true,
      index: true,
    },
    defaultDurationMinutes: {
      type: Number,
      default: null,
      min: 1,
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

// Catalogue listing: active courses first, alphabetical within each group.
trainingCourseSchema.index({ isActive: 1, title: 1 });

export type TrainingCourseDocument = InferSchemaType<
  typeof trainingCourseSchema
>;

export const TrainingCourse =
  (mongoose.models.TrainingCourse as
    | mongoose.Model<TrainingCourseDocument>
    | undefined) ??
  mongoose.model<TrainingCourseDocument>(
    "TrainingCourse",
    trainingCourseSchema,
  );
