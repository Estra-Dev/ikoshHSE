import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";

export const createContractorSchema = z.object({
  name: trimmedNonEmptyString(120),
  registrationNumber: trimmedNonEmptyString(50).optional(),
  trade: trimmedNonEmptyString(80).optional(),
  contactName: trimmedNonEmptyString(100).optional(),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(120)
    .optional(),
  contactPhone: trimmedNonEmptyString(30).optional(),
  projects: z.array(objectIdSchema).optional(),
});

export type CreateContractorInput = z.infer<typeof createContractorSchema>;

export const updateContractorSchema = z
  .object({
    name: trimmedNonEmptyString(120).optional(),
    registrationNumber: trimmedNonEmptyString(50).optional(),
    trade: trimmedNonEmptyString(80).optional(),
    contactName: trimmedNonEmptyString(100).optional(),
    contactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(120)
      .optional(),
    contactPhone: trimmedNonEmptyString(30).optional(),
    projects: z.array(objectIdSchema).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateContractorInput = z.infer<typeof updateContractorSchema>;