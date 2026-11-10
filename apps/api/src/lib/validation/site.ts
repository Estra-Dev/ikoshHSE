import { z } from "zod";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import { isSiteStatus, type SiteStatus } from "../lib/hse-constants.js";

const siteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/, "Code must be 2-32 characters (letters, numbers, hyphen or underscore).");

export const createSiteSchema = z.object({
  projectId: objectIdSchema,
  name: trimmedNonEmptyString(120),
  code: siteCodeSchema,
  location: trimmedNonEmptyString(150).optional(),
  description: z.string().trim().max(1000).optional(),
  status: z.custom<SiteStatus>().optional(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = z
  .object({
    projectId: objectIdSchema.optional(),
    name: trimmedNonEmptyString(120).optional(),
    code: siteCodeSchema.optional(),
    location: trimmedNonEmptyString(150).optional(),
    description: z.string().trim().max(1000).optional(),
    status: z.custom<SiteStatus>().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;