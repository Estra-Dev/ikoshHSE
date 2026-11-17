import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import {
  INSPECTION_SEVERITIES,
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
} from "../hse-constants.js";

/**
 * Inspection scheduling. The project is mandatory; a site is optional but must
 * belong to the project when supplied. The inspector must be an active HSE
 * officer, manager or admin, which the route re-validates against MongoDB.
 * `.strict()` rejects workflow fields so a client cannot self-assign status.
 */
export const createInspectionSchema = z
  .object({
    title: trimmedNonEmptyString(300),
    type: z.enum(INSPECTION_TYPES),
    projectId: objectIdSchema,
    siteId: objectIdSchema.optional(),
    inspectorId: objectIdSchema,
    scheduledFor: z.coerce.date(),
    description: z.string().trim().max(5000).optional(),
  })
  .strict();

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;

/**
 * Management metadata updates. Status and findings are deliberately absent:
 * they are only changed through their dedicated endpoints.
 *
 * `siteId: null` clears the site explicitly. Omitting `siteId` leaves the
 * current site in place.
 */
export const updateInspectionSchema = z
  .object({
    title: trimmedNonEmptyString(300).optional(),
    type: z.enum(INSPECTION_TYPES).optional(),
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.nullable().optional(),
    inspectorId: objectIdSchema.optional(),
    scheduledFor: z.coerce.date().optional(),
    description: z.string().trim().max(5000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateInspectionInput = z.infer<typeof updateInspectionSchema>;

/** Workflow transition. Completion notes are optional when findings exist. */
export const updateInspectionStatusSchema = z
  .object({
    status: z.enum(INSPECTION_STATUSES),
    completionNotes: trimmedNonEmptyString(5000).optional(),
  })
  .strict();

export type UpdateInspectionStatusInput = z.infer<
  typeof updateInspectionStatusSchema
>;

export const createInspectionFindingSchema = z
  .object({
    description: trimmedNonEmptyString(5000),
    severity: z.enum(INSPECTION_SEVERITIES),
    recommendation: z.string().trim().max(5000).optional(),
  })
  .strict();

export type CreateInspectionFindingInput = z.infer<
  typeof createInspectionFindingSchema
>;

/**
 * Raising a corrective action from a finding. Project and site are derived
 * from the inspection, so clients may only choose ownership, due date and an
 * optional description override.
 */
export const linkFindingCorrectiveActionSchema = z
  .object({
    description: trimmedNonEmptyString(5000).optional(),
    assignedTo: objectIdSchema,
    dueDate: z.coerce.date(),
  })
  .strict();

export type LinkFindingCorrectiveActionInput = z.infer<
  typeof linkFindingCorrectiveActionSchema
>;
