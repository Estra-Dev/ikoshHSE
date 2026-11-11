import { z } from "zod";
import { HttpError } from "../http-error.js";
import { EMPLOYMENT_TYPES, IKOSH_ROLES } from "../ikosh-constants.js";

/** 24-character hexadecimal MongoDB ObjectId. */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, "Invalid identifier.");

/**
 * Builds a positive integer query parameter. Missing or empty values fall
 * back to the given default, because HTTP query strings are always strings
 * and empty inputs (e.g. `?page=`) must not fail validation.
 */
const queryInt = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(min).max(max).default(fallback),
  );

export const paginationQuerySchema = z.object({
  page: queryInt(1, 1, 1_000_000),
  limit: queryInt(20, 1, 100),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Pagination extends PaginationQuery {
  skip: number;
}

/**
 * Parses `page`/`limit` query parameters consistently across list routes.
 * Invalid values (for example `?page=abc`) are rejected with a 400 instead of
 * reaching MongoDB as `NaN`.
 */
export function parsePagination(query: {
  page?: unknown;
  limit?: unknown;
}): Pagination {
  const parsed = paginationQuerySchema.safeParse({
    page: query.page,
    limit: query.limit,
  });

  if (!parsed.success) {
    throw new HttpError(400, firstValidationIssue(parsed.error));
  }

  return {
    ...parsed.data,
    skip: (parsed.data.page - 1) * parsed.data.limit,
  };
}

export const ikoshRoleSchema = z.enum(IKOSH_ROLES);

export const employmentTypeSchema = z.enum(EMPLOYMENT_TYPES);

/** Trimmed, non-empty string with a maximum length. */
export const trimmedNonEmptyString = (max: number) =>
  z.string().trim().min(1).max(max);

/** Validates and returns a route parameter as a MongoDB ObjectId string. */
export function parseObjectIdParam(
  value: string | string[] | undefined,
  label: string,
): string {
  const result = objectIdSchema.safeParse(
    typeof value === "string" ? value : undefined,
  );

  if (!result.success) {
    throw new HttpError(400, `Invalid ${label} id.`);
  }

  return result.data;
}

/** First human-readable message from a failed zod parse. */
export function firstValidationIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request data.";
}
