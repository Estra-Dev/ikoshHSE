import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";

export const departmentCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9_-]{1,11}$/,
    "Code must be 2-12 characters (letters, numbers, hyphen or underscore).",
  );

export const createDepartmentSchema = z.object({
  name: trimmedNonEmptyString(80),
  code: departmentCodeSchema,
  description: z.string().trim().max(500).optional(),
  headId: objectIdSchema.nullable().optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z
  .object({
    name: trimmedNonEmptyString(80).optional(),
    code: departmentCodeSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    headId: objectIdSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
