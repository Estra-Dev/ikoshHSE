import { z } from "zod";
import {
  ATTENDANCE_RECORD_STATUSES,
  TRAINING_COURSE_CATEGORIES,
} from "../hse-constants.js";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import { trainingParticipantInputSchema } from "./participant.js";

/** Stable course code: letters, digits, dashes and underscores. */
export const trainingCourseCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "Course code may only contain letters, digits, dashes and underscores.",
  );

export const createTrainingCourseSchema = z
  .object({
    code: trainingCourseCodeSchema,
    title: trimmedNonEmptyString(200),
    category: z.enum(TRAINING_COURSE_CATEGORIES),
    defaultDurationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreateTrainingCourseInput = z.infer<
  typeof createTrainingCourseSchema
>;

export const updateTrainingCourseSchema = z
  .object({
    title: trimmedNonEmptyString(200).optional(),
    category: z.enum(TRAINING_COURSE_CATEGORIES).optional(),
    defaultDurationMinutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(1440)
      .optional(),
    description: z.string().trim().max(2000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateTrainingCourseInput = z.infer<
  typeof updateTrainingCourseSchema
>;

const trainingSessionContentShape = {
  courseId: objectIdSchema,
  projectId: objectIdSchema,
  siteId: objectIdSchema,
  topic: trimmedNonEmptyString(300),
  description: z.string().trim().max(5000).optional(),
  trainerName: trimmedNonEmptyString(200),
  scheduledDate: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
};

/**
 * Session creation. The route re-validates the site (active and belonging to
 * the project), the course (active) and every participant reference.
 */
export const createTrainingSessionSchema = z
  .object({
    ...trainingSessionContentShape,
    participants: z.array(trainingParticipantInputSchema).max(200).optional(),
  })
  .strict();

export type CreateTrainingSessionInput = z.infer<
  typeof createTrainingSessionSchema
>;

/**
 * Content updates while the session is scheduled. Participants are changed
 * through the dedicated participants endpoint so attendance edits are audited
 * separately from topic/trainer metadata.
 */
export const updateTrainingSessionSchema = z
  .object({
    courseId: objectIdSchema.optional(),
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.optional(),
    topic: trimmedNonEmptyString(300).optional(),
    description: z.string().trim().max(5000).optional(),
    trainerName: trimmedNonEmptyString(200).optional(),
    scheduledDate: z.coerce.date().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateTrainingSessionInput = z.infer<
  typeof updateTrainingSessionSchema
>;

export const updateTrainingParticipantsSchema = z
  .object({
    participants: z.array(trainingParticipantInputSchema).max(200),
  })
  .strict();

export type UpdateTrainingParticipantsInput = z.infer<
  typeof updateTrainingParticipantsSchema
>;

/** Completion and cancellation. Cancellation requires a recorded reason. */
export const updateTrainingSessionStatusSchema = z
  .object({
    status: z.enum(ATTENDANCE_RECORD_STATUSES),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "CANCELLED" && !value.reason?.trim()) {
      context.addIssue({
        code: "custom",
        message: "A cancellation reason is required.",
        path: ["reason"],
      });
    }
  });

export type UpdateTrainingSessionStatusInput = z.infer<
  typeof updateTrainingSessionStatusSchema
>;
