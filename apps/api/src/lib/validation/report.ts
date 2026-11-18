import { z } from "zod";
import { objectIdSchema } from "./common.js";

/**
 * Report filters. Date strings are parsed and normalised in the report
 * service so date-only `to` values include the whole UTC day.
 */
export const hseReportQuerySchema = z
  .object({
    projectId: objectIdSchema.optional(),
    siteId: objectIdSchema.optional(),
    from: z.string().trim().max(40).optional(),
    to: z.string().trim().max(40).optional(),
  })
  .strict();

export type HseReportQuery = z.infer<typeof hseReportQuerySchema>;
