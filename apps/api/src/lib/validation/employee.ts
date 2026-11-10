import { z } from "zod";
import {
  employmentTypeSchema,
  ikoshRoleSchema,
  objectIdSchema,
  paginationQuerySchema,
  trimmedNonEmptyString,
} from "./common.js";

export const DIRECTORY_SORT_OPTIONS = [
  "name",
  "-name",
  "employeeId",
  "-employeeId",
  "hireDate",
  "-hireDate",
  "createdAt",
  "-createdAt",
] as const;

export type DirectorySortOption = (typeof DIRECTORY_SORT_OPTIONS)[number];

/** Query parameters for the employee directory listing. */
export const employeeDirectoryQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  department: objectIdSchema.optional(),
  ikoshRole: ikoshRoleSchema.optional(),
  employmentType: employmentTypeSchema.optional(),
  isActive: z.enum(["true", "false"]).optional(),
  sort: z.enum(DIRECTORY_SORT_OPTIONS).optional(),
});

export type EmployeeDirectoryQuery = z.infer<
  typeof employeeDirectoryQuerySchema
>;

const trimmedNullableString = (max: number) =>
  trimmedNonEmptyString(max).nullable();

/**
 * Fields an employee may update on their own record: contact details only.
 * Unknown keys (employment information, roles, status) are stripped.
 */
export const updateOwnProfileSchema = z
  .object({
    phone: trimmedNullableString(30).optional(),
    location: trimmedNullableString(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

/**
 * Employment and contact information, editable by administrators only.
 * Identity fields (email, names) stay owned by DigitAuth.
 */
export const updateEmployeeSchema = z
  .object({
    employeeId: trimmedNullableString(20).optional(),
    jobTitle: trimmedNullableString(80).optional(),
    department: objectIdSchema.nullable().optional(),
    employmentType: employmentTypeSchema.nullable().optional(),
    hireDate: z.union([z.coerce.date(), z.null()]).optional(),
    managerId: objectIdSchema.nullable().optional(),
    phone: trimmedNullableString(30).optional(),
    location: trimmedNullableString(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const updateEmployeeRoleSchema = z.object({
  ikoshRole: ikoshRoleSchema,
});

export const updateEmployeeStatusSchema = z.object({
  isActive: z.boolean(),
});
