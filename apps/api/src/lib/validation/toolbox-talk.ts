import { z } from "zod";
import { ATTENDANCE_RECORD_STATUSES } from "../hse-constants.js";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import { toolboxParticipantInputSchema } from "./participant.js";

const toolboxTalkContentShape = {
  projectId: objectIdSchema,
  siteId: objectIdSchema,
  topic: trimmedNonEmptyString(300),
  discussionPoints: z.string().trim().max(5000).optional(),
  facilitatorName: trimmedNonEmptyString(200),
  scheduledDate: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
};

/**
 * Talk creation. The route re-validates that the site is active and belongs to
 * the project, and resolves every participant reference.
 */
export const createToolboxTalkSchema = z
  .object({
    ...toolboxTalkContentShape,
    participants: z.array(toolboxParticipantInputSchema).max(200).optional(),
  })
  .strict();

export type CreateToolboxTalkInput = z.infer<typeof createToolboxTalkSchema>;

/**
 * Content updates while the talk is scheduled. Attendance and acknowledgements
 * are changed through the dedicated participants endpoint.
 */
export const updateToolboxTalkSchema = z
  .object({
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.optional(),
    topic: trimmedNonEmptyString(300).optional(),
    discussionPoints: z.string().trim().max(5000).optional(),
    facilitatorName: trimmedNonEmptyString(200).optional(),
    scheduledDate: z.coerce.date().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateToolboxTalkInput = z.infer<typeof updateToolboxTalkSchema>;

export const updateToolboxParticipantsSchema = z
  .object({
    participants: z.array(toolboxParticipantInputSchema).max(200),
  })
  .strict();

export type UpdateToolboxParticipantsInput = z.infer<
  typeof updateToolboxParticipantsSchema
>;

/** Completion and cancellation. Cancellation requires a recorded reason. */
export const updateToolboxTalkStatusSchema = z
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

export type UpdateToolboxTalkStatusInput = z.infer<
  typeof updateToolboxTalkStatusSchema
>;
