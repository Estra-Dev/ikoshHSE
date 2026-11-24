import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import {
  PERMIT_PRECAUTIONS,
  PERMIT_STATUSES,
  PERMIT_TO_WORK_TYPES,
  PARTICIPANT_ATTENDANCE_STATES,
  WORKFORCE_PARTICIPANT_KINDS,
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
  // The route deduplicates before enforcing the limit of 10 unique links.
  riskAssessmentIds: z.array(objectIdSchema).optional(),
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
    // The route deduplicates before enforcing the limit of 10 unique links.
    riskAssessmentIds: z.array(objectIdSchema).optional(),
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

/**
 * Permit readiness capture validation.
 *
 * Actor ids and timestamps are deliberately absent from the recorded-event
 * schemas. The route stamps them from the authenticated viewer so a client
 * cannot attribute evidence to someone else or backdate it. Unknown nested
 * keys (including forged `recordedBy`/`recordedAt` values) are stripped before
 * the route sees them.
 */
export const permitReadinessPersonnelSchema = z
  .object({
    kind: z.enum(WORKFORCE_PARTICIPANT_KINDS),
    employee: objectIdSchema.optional(),
    contractorPersonnel: objectIdSchema.optional(),
    contractor: objectIdSchema.optional(),
    name: trimmedNonEmptyString(200),
    role: trimmedNonEmptyString(100).optional(),
    notes: trimmedNonEmptyString(500).optional(),
    attendance: z.enum(PARTICIPANT_ATTENDANCE_STATES).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "EMPLOYEE") {
      if (!value.employee) {
        context.addIssue({
          code: "custom",
          message: "An employee reference is required for employee personnel.",
          path: ["employee"],
        });
      }

      if (value.contractorPersonnel) {
        context.addIssue({
          code: "custom",
          message:
            "Contractor personnel cannot be supplied for employee personnel.",
          path: ["contractorPersonnel"],
        });
      }

      if (value.contractor) {
        context.addIssue({
          code: "custom",
          message: "A contractor cannot be supplied for employee personnel.",
          path: ["contractor"],
        });
      }

      return;
    }

    if (!value.contractorPersonnel) {
      context.addIssue({
        code: "custom",
        message:
          "A contractor personnel reference is required for contractor personnel.",
        path: ["contractorPersonnel"],
      });
    }

    if (value.employee) {
      context.addIssue({
        code: "custom",
        message: "An employee cannot be supplied for contractor personnel.",
        path: ["employee"],
      });
    }
  });

export const permitReadinessEquipmentSchema = z.object({
  name: trimmedNonEmptyString(200),
  reference: trimmedNonEmptyString(100).optional(),
  inspection: objectIdSchema.optional(),
  condition: trimmedNonEmptyString(200).optional(),
});

export const permitReadinessIsolationSchema = z.object({
  point: trimmedNonEmptyString(200),
  method: trimmedNonEmptyString(200),
  tagNumber: trimmedNonEmptyString(50).optional(),
  attachmentIds: z.array(objectIdSchema).min(1).max(20),
});

export const permitReadinessGasTestSchema = z.object({
  area: trimmedNonEmptyString(200).optional(),
  instrument: trimmedNonEmptyString(200).optional(),
  oxygenPct: z.number().min(0).max(100).optional(),
  lelPct: z.number().min(0).max(100).optional(),
  h2sPpm: z.number().min(0).optional(),
  coPpm: z.number().min(0).optional(),
  result: trimmedNonEmptyString(200).optional(),
  attachmentIds: z.array(objectIdSchema).min(1).max(20),
});

export const permitReadinessLinksSchema = z.object({
  inspectionIds: z.array(objectIdSchema).optional(),
  ppeIssuanceIds: z.array(objectIdSchema).optional(),
  correctiveActionIds: z.array(objectIdSchema).optional(),
  contractorIds: z.array(objectIdSchema).optional(),
  toolboxTalkId: objectIdSchema.nullable().optional(),
});

export const permitReadinessWorksiteVerificationSchema = z
  .object({
    // The verifier and timestamp are stamped by the server from the
    // authenticated viewer. Any client-supplied verifier is stripped.
    notes: trimmedNonEmptyString(500).optional(),
    attachmentIds: z.array(objectIdSchema).optional(),
  })
  .nullable()
  .optional();

export const permitReadinessAttestationSchema = z.object({
  requirementId: trimmedNonEmptyString(100),
  state: z.enum(["SATISFIED", "NOT_APPLICABLE"]),
  note: trimmedNonEmptyString(500).optional(),
  attachmentIds: z.array(objectIdSchema).optional(),
});

export const permitOperationalRecordSchema = z
  .object({
    type: z.enum(["MONITORING_CHECK", "REVALIDATION"]),
    notes: trimmedNonEmptyString(2000),
    attachmentIds: z.array(objectIdSchema).max(20).optional(),
  })
  .strict();

export type PermitOperationalRecordInput = z.infer<
  typeof permitOperationalRecordSchema
>;

export const permitReadinessSchema = z
  .object({
    personnel: z.array(permitReadinessPersonnelSchema).optional(),
    equipment: z.array(permitReadinessEquipmentSchema).optional(),
    isolations: z.array(permitReadinessIsolationSchema).optional(),
    gasTests: z.array(permitReadinessGasTestSchema).optional(),
    links: permitReadinessLinksSchema.optional(),
    worksiteVerification: permitReadinessWorksiteVerificationSchema,
    attestations: z.array(permitReadinessAttestationSchema).optional(),
  })
  .strict();

export type PermitReadinessPersonnelInput = z.infer<
  typeof permitReadinessPersonnelSchema
>;
export type PermitReadinessEquipmentInput = z.infer<
  typeof permitReadinessEquipmentSchema
>;
export type PermitReadinessIsolationInput = z.infer<
  typeof permitReadinessIsolationSchema
>;
export type PermitReadinessGasTestInput = z.infer<
  typeof permitReadinessGasTestSchema
>;
export type PermitReadinessLinksInput = z.infer<
  typeof permitReadinessLinksSchema
>;
export type PermitReadinessWorksiteVerificationInput = z.infer<
  typeof permitReadinessWorksiteVerificationSchema
>;
export type PermitReadinessAttestationInput = z.infer<
  typeof permitReadinessAttestationSchema
>;
export type UpdatePermitReadinessInput = z.infer<typeof permitReadinessSchema>;
