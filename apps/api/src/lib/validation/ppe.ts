import { z } from "zod";
import {
  PPE_CATEGORIES,
  PPE_CONDITIONS,
  PPE_UNITS,
} from "../hse-constants.js";
import { objectIdSchema, trimmedNonEmptyString } from "./common.js";
import { participantInputSchema } from "./participant.js";

/** Stable catalogue code: letters, digits, dashes and underscores. */
export const ppeItemCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "Catalogue code may only contain letters, digits, dashes and underscores.",
  )
  .transform((value) => value.toUpperCase());

export const createPpeItemSchema = z
  .object({
    code: ppeItemCodeSchema,
    name: trimmedNonEmptyString(200),
    category: z.enum(PPE_CATEGORIES),
    size: z.string().trim().max(40).optional(),
    unit: z.enum(PPE_UNITS),
    description: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CreatePpeItemInput = z.infer<typeof createPpeItemSchema>;

export const updatePpeItemSchema = z
  .object({
    name: trimmedNonEmptyString(200).optional(),
    category: z.enum(PPE_CATEGORIES).optional(),
    size: z.string().trim().max(40).nullable().optional(),
    unit: z.enum(PPE_UNITS).optional(),
    description: z.string().trim().max(2000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export type UpdatePpeItemInput = z.infer<typeof updatePpeItemSchema>;

const stockQuantitySchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(1_000_000);

const stockReasonSchema = trimmedNonEmptyString(1000);

export const createPpeStockSchema = z
  .object({
    itemId: objectIdSchema,
    siteId: objectIdSchema,
    quantityOnHand: stockQuantitySchema,
    minimumQuantity: stockQuantitySchema.default(0),
    reason: stockReasonSchema,
  })
  .strict();

export type CreatePpeStockInput = z.infer<typeof createPpeStockSchema>;

export const updatePpeStockSchema = z
  .object({
    quantityOnHand: stockQuantitySchema.optional(),
    minimumQuantity: stockQuantitySchema.optional(),
    reason: stockReasonSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.quantityOnHand !== undefined ||
      value.minimumQuantity !== undefined,
    { message: "At least one stock level is required." },
  );

export type UpdatePpeStockInput = z.infer<typeof updatePpeStockSchema>;

export const issuePpeSchema = z
  .object({
    itemId: objectIdSchema,
    siteId: objectIdSchema,
    recipient: participantInputSchema,
    quantity: z.coerce.number().int().min(1).max(10_000),
    conditionAtIssue: z.enum(PPE_CONDITIONS),
    issuedOn: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type IssuePpeInput = z.infer<typeof issuePpeSchema>;

export const returnPpeSchema = z
  .object({
    returnedOn: z.coerce.date().optional(),
    returnCondition: z.enum(PPE_CONDITIONS),
    restock: z.boolean().default(false),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type ReturnPpeInput = z.infer<typeof returnPpeSchema>;

export const replacePpeSchema = z
  .object({
    issuedOn: z.coerce.date().optional(),
    conditionAtIssue: z.enum(PPE_CONDITIONS).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type ReplacePpeInput = z.infer<typeof replacePpeSchema>;

export const lostPpeSchema = z
  .object({
    lostOn: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type LostPpeInput = z.infer<typeof lostPpeSchema>;
