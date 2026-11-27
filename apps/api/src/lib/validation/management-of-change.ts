import { z } from "zod";
import { objectIdSchema } from "./common.js";

const optionalDate = z.string().datetime().nullable().optional();

const text = (max = 5000) => z.string().trim().max(max);
const requiredText = (max = 5000) =>
  z.string().trim().min(1, "This section is required.").max(max);

export const MANAGEMENT_OF_CHANGE_STATUSES = [
  "DRAFT",
  "ASSESSMENT",
  "PENDING_APPROVAL",
  "APPROVED",
  "IMPLEMENTING",
  "VERIFICATION",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;

export const managementOfChangeStatusSchema = z.enum(
  MANAGEMENT_OF_CHANGE_STATUSES,
);

export const createManagementOfChangeSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    reason: z.string().trim().min(1, "Reason is required.").max(5000),
    scope: z.string().trim().min(1, "Scope is required.").max(5000),
    changeType: z.enum(["TEMPORARY", "PERMANENT"]),
    plannedStartAt: optionalDate,
    plannedEndAt: optionalDate,
    affectedAssets: z
      .array(z.string().trim().min(1).max(200))
      .max(100)
      .default([]),
    affectedPeople: z
      .array(z.string().trim().min(1).max(200))
      .max(100)
      .default([]),
    project: objectIdSchema,
    site: objectIdSchema.nullable().optional(),
  })
  .refine(
    (value) => {
      if (!value.plannedStartAt || !value.plannedEndAt) {
        return true;
      }

      return (
        new Date(value.plannedEndAt).getTime() >=
        new Date(value.plannedStartAt).getTime()
      );
    },
    {
      message: "The planned end date cannot be earlier than the start date.",
      path: ["plannedEndAt"],
    },
  );

export const managementOfChangeApprovalSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    comments: z.string().trim().max(2000).optional().default(""),
  })
  .strict();

export const updateManagementOfChangeAssessmentSchema = z.object({
  qhseRisks: requiredText(),
  environmentalAspects: requiredText(),
  legalAndClientObligations: requiredText(),
  competenceRequirements: requiredText(),
  procedureChanges: requiredText(),
  emergencyArrangements: requiredText(),
  interfaces: requiredText(),
  riskAssessment: objectIdSchema.nullable().optional(),
});

export const updateManagementOfChangeImplementationSchema = z.object({
  controls: text(),
  testingPlan: text(),
  communicationPlan: text(),
  rollbackPlan: text(),
  updatedDocuments: z.array(z.string().trim().min(1).max(300)).max(100),
  briefingCompleted: z.boolean(),
});

export const updateManagementOfChangeVerificationSchema = z.object({
  findings: text(),
  testingCompleted: z.boolean(),
  inspectionCompleted: z.boolean(),
  actionsClosed: z.boolean(),
});

export const managementOfChangeListQuerySchema = z.object({
  status: managementOfChangeStatusSchema.optional(),
  projectId: objectIdSchema.optional(),
  siteId: objectIdSchema.optional(),
  q: z.string().trim().max(200).optional(),
});

export const managementOfChangeIdSchema = z.object({
  id: objectIdSchema,
});
