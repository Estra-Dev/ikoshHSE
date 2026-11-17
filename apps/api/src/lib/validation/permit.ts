import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import {
  PERMIT_PRECAUTIONS,
  PERMIT_STATUSES,
  PERMIT_TO_WORK_TYPES,
} from "../hse-constants.js";

/**
 * One hazard line in a permit. Both the hazard and the controls are required:
 * a permit that identifies a risk without saying how it is controlled must not
 * reach the approval queue.
 */
export const permitHazardSchema = z
  .object({
    hazard: trimmedNonEmptyString(500),
    controlMeasures: trimmedNonEmptyString(2000),
  })
  .strict();

export type PermitHazardInput = z.infer<typeof permitHazardSchema>;

const permitContentShape = {
  workDescription: trimmedNonEmptyString(5000),
  workType: z.enum(PERMIT_TO_WORK_TYPES),
  projectId: objectIdSchema,
  siteId: objectIdSchema,
  location: z.string().trim().max(300).optional(),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
  responsiblePersonId: objectIdSchema,
  workersInvolved: z.array(trimmedNonEmptyString(200)).min(1).max(50),
  requiredPrecautions: z.array(z.enum(PERMIT_PRECAUTIONS)).min(1).max(20),
  hazards: z.array(permitHazardSchema).min(1).max(50),
};

/**
 * Permit creation. A site is mandatory and must be active and belong to the
 * project; the route re-validates that against MongoDB. `.strict()` rejects
 * status, approval and closure fields so a client cannot self-approve.
 */
export const createPermitSchema = z
  .object(permitContentShape)
  .strict()
  .refine((value) => value.validTo.getTime() > value.validFrom.getTime(), {
    message: "Validity must end after it starts.",
    path: ["validTo"],
  });

export type CreatePermitInput = z.infer<typeof createPermitSchema>;

/**
 * DRAFT-only content updates. Status and workflow fields are deliberately
 * absent: they are only changed through the dedicated lifecycle endpoint.
 *
 * Omitting a field leaves it unchanged; the route validates the merged validity
 * window and re-checks the responsible person against the final site.
 */
export const updatePermitSchema = z
  .object({
    workDescription: trimmedNonEmptyString(5000).optional(),
    workType: z.enum(PERMIT_TO_WORK_TYPES).optional(),
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.optional(),
    location: z.string().trim().max(300).optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    responsiblePersonId: objectIdSchema.optional(),
    workersInvolved: z
      .array(trimmedNonEmptyString(200))
      .min(1)
      .max(50)
      .optional(),
    requiredPrecautions: z
      .array(z.enum(PERMIT_PRECAUTIONS))
      .min(1)
      .max(20)
      .optional(),
    hazards: z.array(permitHazardSchema).min(1).max(50).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdatePermitInput = z.infer<typeof updatePermitSchema>;

export const permitClosureChecksSchema = z
  .object({
    workAreaSecured: z.boolean(),
    personnelAccountedFor: z.boolean(),
    equipmentIsolated: z.boolean(),
    siteHandoverCompleted: z.boolean(),
  })
  .strict();

export type PermitClosureChecksInput = z.infer<
  typeof permitClosureChecksSchema
>;

/**
 * Lifecycle transition request. Authorization and transition legality are
 * enforced by the route; this schema enforces the content each action needs.
 */
export const updatePermitStatusSchema = z
  .object({
    status: z.enum(PERMIT_STATUSES),
    reason: z.string().trim().max(2000).optional(),
    closureNotes: z.string().trim().max(5000).optional(),
    closureChecks: permitClosureChecksSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.status === "REJECTED" ||
        value.status === "CANCELLED" ||
        value.status === "SUSPENDED") &&
      !value.reason?.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "A reason is required for this status change.",
        path: ["reason"],
      });
    }

    if (value.status === "CLOSED") {
      if (!value.closureNotes?.trim()) {
        context.addIssue({
          code: "custom",
          message: "Closure notes are required.",
          path: ["closureNotes"],
        });
      }

      if (!value.closureChecks) {
        context.addIssue({
          code: "custom",
          message: "All closure checks must be confirmed before closing.",
          path: ["closureChecks"],
        });
        return;
      }

      const incomplete = Object.values(value.closureChecks).some(
        (checked) => checked !== true,
      );

      if (incomplete) {
        context.addIssue({
          code: "custom",
          message: "All closure checks must be confirmed before closing.",
          path: ["closureChecks"],
        });
      }
    }
  });

export type UpdatePermitStatusInput = z.infer<
  typeof updatePermitStatusSchema
>;
