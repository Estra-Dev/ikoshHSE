import { z } from "zod";
import { trimmedNonEmptyString } from "./common.js";
import { isProjectStatus, type ProjectStatus } from "../hse-constants.js";

const projectCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/, "Code must be 2-32 characters (letters, numbers, hyphen or underscore).");

export const createProjectSchema = z.object({
  name: trimmedNonEmptyString(120),
  code: projectCodeSchema,
  description: z.string().trim().max(1000).optional(),
  client: trimmedNonEmptyString(100).optional(),
  location: trimmedNonEmptyString(150).optional(),
  status: z.custom<ProjectStatus>(isProjectStatus).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: trimmedNonEmptyString(120).optional(),
    code: projectCodeSchema.optional(),
    description: z.string().trim().max(1000).optional(),
    client: trimmedNonEmptyString(100).optional(),
    location: trimmedNonEmptyString(150).optional(),
    status: z.custom<ProjectStatus>(isProjectStatus).optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;