import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";

export const createContractorPersonnelSchema = z.object({
  contractorId: objectIdSchema,
  firstName: trimmedNonEmptyString(80),
  lastName: trimmedNonEmptyString(80),
  personnelId: trimmedNonEmptyString(50).optional(),
  jobTitle: trimmedNonEmptyString(120).optional(),
  phone: trimmedNonEmptyString(30).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(120)
    .optional(),
  siteId: objectIdSchema.optional(),
});

export type CreateContractorPersonnelInput = z.infer<
  typeof createContractorPersonnelSchema
>;

export const updateContractorPersonnelSchema = z
  .object({
    contractorId: objectIdSchema.optional(),
    firstName: trimmedNonEmptyString(80).optional(),
    lastName: trimmedNonEmptyString(80).optional(),
    personnelId: trimmedNonEmptyString(50).optional(),
    jobTitle: trimmedNonEmptyString(120).optional(),
    phone: trimmedNonEmptyString(30).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(120)
      .optional(),
    siteId: objectIdSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateContractorPersonnelInput = z.infer<
  typeof updateContractorPersonnelSchema
>;