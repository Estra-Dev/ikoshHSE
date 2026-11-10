import { z } from "zod";
import { objectIdSchema } from "./common.js";

export const auditLogQuerySchema = z.object({
  entityType: z.string().trim().optional(),
  entityId: objectIdSchema.optional(),
  action: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;