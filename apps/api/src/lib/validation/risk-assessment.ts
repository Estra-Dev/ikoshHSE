import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import { RISK_ASSESSMENT_STATUSES } from "../hse-constants.js";

/**
 * One hazard line in a risk assessment.
 *
 * Clients submit likelihood and severity scores only. Inherent and residual
 * risk levels are always derived on the server so a client cannot forge a
 * "LOW" rating for a high-scoring hazard. Scores use the standard 5×5 matrix
 * (1 = rare/negligible, 5 = almost certain/catastrophic).
 *
 * The hazard text fields are business data and cap out well below the document
 * limit; audit snapshots deliberately exclude them.
 */
export const riskHazardSchema = z
  .object({
    hazard: trimmedNonEmptyString(500),
    consequences: z.string().trim().max(2000).optional(),
    existingControls: z.string().trim().max(2000).optional(),
    likelihood: z.number().int().min(1).max(5),
    severity: z.number().int().min(1).max(5),
    residualLikelihood: z.number().int().min(1).max(5),
    residualSeverity: z.number().int().min(1).max(5),
    additionalControls: z.string().trim().max(2000).optional(),
  })
  .strict();

export type RiskHazardInput = z.infer<typeof riskHazardSchema>;

/**
 * Risk assessment creation. The project is mandatory; a site is optional but
 * must belong to the project when supplied. `.strict()` rejects status and
 * derived-level fields so a client cannot self-approve an assessment.
 */
export const createRiskAssessmentSchema = z
  .object({
    title: trimmedNonEmptyString(300),
    description: z.string().trim().max(5000).optional(),
    projectId: objectIdSchema,
    siteId: objectIdSchema.optional(),
    ownerId: objectIdSchema,
    reviewDate: z.coerce.date().optional(),
    hazards: z.array(riskHazardSchema).min(1).max(100),
  })
  .strict();

export type CreateRiskAssessmentInput = z.infer<
  typeof createRiskAssessmentSchema
>;

/**
 * DRAFT-only metadata and hazard updates. Status is deliberately absent: it is
 * only changed through the dedicated workflow endpoint. Supplying `hazards`
 * replaces the whole hazard list, which keeps the form state authoritative.
 *
 * `siteId: null` clears the site explicitly. Omitting `siteId` leaves the
 * current site in place.
 */
export const updateRiskAssessmentSchema = z
  .object({
    title: trimmedNonEmptyString(300).optional(),
    description: z.string().trim().max(5000).optional(),
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.nullable().optional(),
    ownerId: objectIdSchema.optional(),
    reviewDate: z.coerce.date().nullable().optional(),
    hazards: z.array(riskHazardSchema).min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateRiskAssessmentInput = z.infer<
  typeof updateRiskAssessmentSchema
>;

/** Workflow transition. Authorization and transition legality are enforced by the route. */
export const updateRiskAssessmentStatusSchema = z
  .object({
    status: z.enum(RISK_ASSESSMENT_STATUSES),
  })
  .strict();

export type UpdateRiskAssessmentStatusInput = z.infer<
  typeof updateRiskAssessmentStatusSchema
>;
