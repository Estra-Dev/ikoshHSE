import { DigitAuthError } from "@digit-auth/node";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./http-error.js";

/**
 * Client-facing message for upstream authentication outages. The upstream
 * status and SDK message are intentionally not exposed.
 */
export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "Authentication service is temporarily unavailable. Please try again shortly.";

/**
 * Centralized API error handler.
 *
 * Never exposes internal stack traces or upstream SDK details to clients.
 * Intentional application errors (`HttpError`) keep their safe message;
 * DigitAuth failures are mapped to clear authentication/availability
 * responses. Authentication is never bypassed: an outage fails closed.
 */
export function apiErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("API request error:", error);

  // Intentional application errors carry a safe, client-facing message.
  if (error instanceof HttpError) {
    res.status(error.status).json({
      success: false,
      message: error.message,
    });
    return;
  }

  if (error instanceof DigitAuthError) {
    if (error.status === 401) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (error.status === 503 || error.status === 504) {
      res.status(error.status).json({
        success: false,
        message: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
      });
      return;
    }
  }

  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;

  const message =
    status === 401
      ? "Authentication required."
      : status >= 400 && status < 500
        ? "Request could not be processed."
        : "Internal server error.";

  res.status(status).json({
    success: false,
    message,
  });
}
