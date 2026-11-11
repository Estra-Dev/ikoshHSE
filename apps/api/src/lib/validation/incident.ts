import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "../hse-constants.js";

/**
 * Reporters submit observational facts only. `.strict()` rejects attempts to
 * inject management-controlled `category` or `status` fields.
 */
export const createIncidentSchema = z
  .object({
    siteId: objectIdSchema,
    type: z.enum(INCIDENT_TYPES).optional(),
    title: trimmedNonEmptyString(160),
    description: trimmedNonEmptyString(5000),
    occurredAt: z.coerce.date(),
    location: trimmedNonEmptyString(200).optional(),
    immediateActions: trimmedNonEmptyString(2000).optional(),
  })
  .strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z
  .object({
    type: z.enum(INCIDENT_TYPES).optional(),
    title: trimmedNonEmptyString(160).optional(),
    description: trimmedNonEmptyString(5000).optional(),
    occurredAt: z.coerce.date().optional(),
    location: trimmedNonEmptyString(200).optional(),
    immediateActions: trimmedNonEmptyString(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const classifyIncidentSchema = z
  .object({
    category: z.enum(INCIDENT_CATEGORIES),
  })
  .strict();

export const updateIncidentStatusSchema = z
  .object({
    status: z.enum(INCIDENT_STATUSES),
  })
  .strict();
