import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import {
  AUDIT_CHECKLIST_RESULTS,
  AUDIT_FINDING_SEVERITIES,
  AUDIT_STATUSES,
  AUDIT_TYPES,
} from "../hse-constants.js";

/**
 * One checklist question supplied when an audit is planned. Results start
 * PENDING and are recorded later through the dedicated checklist endpoint.
 */
export const createAuditChecklistItemSchema = z
  .object({
    item: trimmedNonEmptyString(1000),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreateAuditChecklistItemInput = z.infer<
  typeof createAuditChecklistItemSchema
>;

/**
 * Audit scheduling. The project is mandatory; a site is optional but must
 * belong to the project. Auditors must be active HSE personnel, which the route
 * re-validates against MongoDB. `.strict()` rejects status and workflow fields
 * so a client cannot self-assign status or completion metadata.
 */
export const createHseAuditSchema = z
  .object({
    title: trimmedNonEmptyString(300),
    type: z.enum(AUDIT_TYPES),
    projectId: objectIdSchema,
    siteId: objectIdSchema.optional(),
    auditorIds: z.array(objectIdSchema).min(1).max(20),
    scheduledFor: z.coerce.date(),
    description: z.string().trim().max(5000).optional(),
    checklist: z.array(createAuditChecklistItemSchema).max(200).optional(),
  })
  .strict();

export type CreateHseAuditInput = z.infer<typeof createHseAuditSchema>;

/**
 * Management metadata updates. Status, checklist results, findings and
 * completion metadata are deliberately absent: they change through their
 * dedicated endpoints. `siteId: null` clears the site explicitly.
 */
export const updateHseAuditSchema = z
  .object({
    title: trimmedNonEmptyString(300).optional(),
    type: z.enum(AUDIT_TYPES).optional(),
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.nullable().optional(),
    auditorIds: z.array(objectIdSchema).min(1).max(20).optional(),
    scheduledFor: z.coerce.date().optional(),
    description: z.string().trim().max(5000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateHseAuditInput = z.infer<typeof updateHseAuditSchema>;

/** Records or updates one checklist result while the audit is live. */
export const updateAuditChecklistItemSchema = z
  .object({
    result: z.enum(AUDIT_CHECKLIST_RESULTS),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type UpdateAuditChecklistItemInput = z.infer<
  typeof updateAuditChecklistItemSchema
>;

/** A finding recorded during an audit. */
export const createAuditFindingSchema = z
  .object({
    description: trimmedNonEmptyString(5000),
    severity: z.enum(AUDIT_FINDING_SEVERITIES),
    recommendation: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreateAuditFindingInput = z.infer<typeof createAuditFindingSchema>;

/** Raises and links a corrective action from one audit finding. */
export const linkAuditFindingCorrectiveActionSchema = z
  .object({
    assignedTo: objectIdSchema,
    dueDate: z.coerce.date(),
    description: trimmedNonEmptyString(5000).optional(),
  })
  .strict();

export type LinkAuditFindingCorrectiveActionInput = z.infer<
  typeof linkAuditFindingCorrectiveActionSchema
>;

/**
 * Workflow transition. Completion notes are optional when findings exist; the
 * route enforces that rule against the stored record.
 */
export const updateHseAuditStatusSchema = z
  .object({
    status: z.enum(AUDIT_STATUSES),
    completionNotes: trimmedNonEmptyString(5000).optional(),
  })
  .strict();

export type UpdateHseAuditStatusInput = z.infer<
  typeof updateHseAuditStatusSchema
>;
