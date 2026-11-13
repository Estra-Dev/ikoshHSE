import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import {
  CORRECTIVE_ACTION_SOURCES,
  CORRECTIVE_ACTION_STATUSES,
} from "../hse-constants.js";

/**
 * Corrective action creation.
 *
 * Incident/near-miss sources must reference the originating report; project
 * and site are derived by the API from that report. Manual sources supply a
 * project and optionally a site. `.strict()` rejects workflow fields so a
 * client can never self-assign status or verification.
 */
export const createCorrectiveActionSchema = z
  .object({
    description: trimmedNonEmptyString(5000),
    source: z.enum(CORRECTIVE_ACTION_SOURCES),
    incidentId: objectIdSchema.optional(),
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.optional(),
    assignedTo: objectIdSchema,
    dueDate: z.coerce.date(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "INCIDENT" || value.source === "NEAR_MISS") {
      if (!value.incidentId) {
        ctx.addIssue({
          code: "custom",
          message: "An incident is required for this source.",
          path: ["incidentId"],
        });
      }

      if (value.projectId || value.siteId) {
        ctx.addIssue({
          code: "custom",
          message:
            "Project and site are derived from the linked incident and must not be supplied.",
          path: ["projectId"],
        });
      }

      return;
    }

    if (value.incidentId) {
      ctx.addIssue({
        code: "custom",
        message:
          "An incident link is only valid for incident and near-miss sources.",
        path: ["incidentId"],
      });
    }

    if (!value.projectId) {
      ctx.addIssue({
        code: "custom",
        message: "A project is required for this source.",
        path: ["projectId"],
      });
    }
  });

export type CreateCorrectiveActionInput = z.infer<
  typeof createCorrectiveActionSchema
>;

/**
 * Management metadata updates. Source and the linked incident are immutable
 * once created, so they are not part of this schema and are rejected by
 * `.strict()`.
 */
export const updateCorrectiveActionSchema = z
  .object({
    description: trimmedNonEmptyString(5000).optional(),
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
    dueDate: z.coerce.date().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateCorrectiveActionInput = z.infer<
  typeof updateCorrectiveActionSchema
>;

/** Workflow transition. Completion requires notes; verification is reserved. */
export const updateCorrectiveActionStatusSchema = z
  .object({
    status: z.enum(CORRECTIVE_ACTION_STATUSES),
    completionNotes: trimmedNonEmptyString(5000).optional(),
    verificationNotes: trimmedNonEmptyString(5000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "COMPLETED" && !value.completionNotes) {
      ctx.addIssue({
        code: "custom",
        message: "Completion notes are required before completing an action.",
        path: ["completionNotes"],
      });
    }
  });

export type UpdateCorrectiveActionStatusInput = z.infer<
  typeof updateCorrectiveActionStatusSchema
>;
