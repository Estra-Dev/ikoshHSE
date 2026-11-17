import { z } from "zod";
import {
  PARTICIPANT_ATTENDANCE_STATES,
  WORKFORCE_PARTICIPANT_KINDS,
  type WorkforceParticipantKind,
} from "../hse-constants.js";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";

/**
 * Fields shared by every participant reference.
 *
 * Exactly one workforce reference must match `kind`: IKOSH employees point at
 * `User` records, contractor personnel point at `ContractorPersonnel` records.
 * The two identifiers are never interchangeable.
 */
const participantReferenceShape = {
  kind: z.enum(WORKFORCE_PARTICIPANT_KINDS),
  employeeId: objectIdSchema.optional(),
  contractorPersonnelId: objectIdSchema.optional(),
  attendance: z.enum(PARTICIPANT_ATTENDANCE_STATES).optional(),
  notes: z.string().trim().max(1000).optional(),
};

interface ParticipantReference {
  kind: WorkforceParticipantKind;
  employeeId?: string;
  contractorPersonnelId?: string;
}

function refineParticipantReference(
  value: ParticipantReference,
  context: z.RefinementCtx,
): void {
  if (value.kind === "EMPLOYEE") {
    if (!value.employeeId) {
      context.addIssue({
        code: "custom",
        message: "Select an employee for an employee participant.",
        path: ["employeeId"],
      });
    }

    if (value.contractorPersonnelId) {
      context.addIssue({
        code: "custom",
        message:
          "Contractor personnel cannot be recorded as an employee participant.",
        path: ["contractorPersonnelId"],
      });
    }

    return;
  }

  if (!value.contractorPersonnelId) {
    context.addIssue({
      code: "custom",
      message: "Select contractor personnel for a contractor participant.",
      path: ["contractorPersonnelId"],
    });
  }

  if (value.employeeId) {
    context.addIssue({
      code: "custom",
      message:
        "An employee cannot be recorded as a contractor personnel participant.",
      path: ["employeeId"],
    });
  }
}

export const participantInputSchema = z
  .object(participantReferenceShape)
  .strict()
  .superRefine(refineParticipantReference);

export type ParticipantInput = z.infer<typeof participantInputSchema>;

/** Certificate details, validated as a group when present. */
const certificateShape = {
  certificateNumber: trimmedNonEmptyString(120).optional(),
  certificateIssuedOn: z.coerce.date().optional(),
  certificateExpiresOn: z.coerce.date().optional(),
};

export const trainingParticipantInputSchema = z
  .object({
    ...participantReferenceShape,
    ...certificateShape,
    completed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    refineParticipantReference(value, context);

    if (value.completed && value.attendance !== "ATTENDED") {
      context.addIssue({
        code: "custom",
        message: "A participant must be marked as attended to be completed.",
        path: ["completed"],
      });
    }

    const { certificateNumber, certificateIssuedOn, certificateExpiresOn } =
      value;

    if (certificateNumber && !certificateIssuedOn) {
      context.addIssue({
        code: "custom",
        message:
          "A certificate issue date is required with a certificate number.",
        path: ["certificateIssuedOn"],
      });
    }

    if (certificateExpiresOn && !certificateIssuedOn) {
      context.addIssue({
        code: "custom",
        message: "A certificate issue date is required before an expiry date.",
        path: ["certificateIssuedOn"],
      });
    }

    if (
      certificateIssuedOn &&
      certificateExpiresOn &&
      certificateExpiresOn.getTime() < certificateIssuedOn.getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "Certificate expiry cannot be before the issue date.",
        path: ["certificateExpiresOn"],
      });
    }
  });

export type TrainingParticipantInput = z.infer<
  typeof trainingParticipantInputSchema
>;

export const toolboxParticipantInputSchema = z
  .object({
    ...participantReferenceShape,
    acknowledged: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    refineParticipantReference(value, context);

    if (value.acknowledged && value.attendance !== "ATTENDED") {
      context.addIssue({
        code: "custom",
        message:
          "A participant must be marked as attended to acknowledge a talk.",
        path: ["acknowledged"],
      });
    }
  });

export type ToolboxParticipantInput = z.infer<
  typeof toolboxParticipantInputSchema
>;
