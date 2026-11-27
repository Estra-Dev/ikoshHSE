import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DigitAuthError } from "@digit-auth/node";
import {
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  apiErrorHandler,
} from "../src/lib/api-error-handler.js";
import { HttpError } from "../src/lib/http-error.js";

/**
 * Minimal app exercising the production error handler with errors thrown from
 * routes, mirroring how `requireAuth` forwards DigitAuth failures.
 */
function buildTestApp(): express.Express {
  const testApp = express();

  testApp.get("/unauthorized", () => {
    throw new DigitAuthError(
      "Upstream detail that must not leak.",
      401,
      "API_ERROR",
    );
  });

  testApp.get("/unavailable", () => {
    throw new DigitAuthError(
      "Unable to connect to the DigitAuth API.",
      503,
      "NETWORK_ERROR",
    );
  });

  testApp.get("/timeout", () => {
    throw new DigitAuthError(
      "DigitAuth API request timed out.",
      504,
      "NETWORK_ERROR",
    );
  });

  testApp.get("/conflict", () => {
    throw new HttpError(409, "A change request already exists.");
  });

  testApp.get("/boom", () => {
    throw new Error("Database connection string leaked.");
  });

  testApp.use(apiErrorHandler);

  return testApp;
}

describe("API error handler", () => {
  beforeEach(() => {
    // Keep expected failure logging out of the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps intentional application error messages", async () => {
    const response = await request(buildTestApp()).get("/conflict");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      message: "A change request already exists.",
    });
  });

  it("maps missing or invalid tokens to a generic 401", async () => {
    const response = await request(buildTestApp()).get("/unauthorized");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required.");
    expect(JSON.stringify(response.body)).not.toContain(
      "Upstream detail that must not leak.",
    );
  });

  it("maps an unreachable authentication service to a clear 503", async () => {
    const response = await request(buildTestApp()).get("/unavailable");

    expect(response.status).toBe(503);
    expect(response.body.message).toBe(AUTH_SERVICE_UNAVAILABLE_MESSAGE);
    expect(JSON.stringify(response.body)).not.toContain(
      "Unable to connect to the DigitAuth API.",
    );
  });

  it("maps an authentication timeout to a clear 504", async () => {
    const response = await request(buildTestApp()).get("/timeout");

    expect(response.status).toBe(504);
    expect(response.body.message).toBe(AUTH_SERVICE_UNAVAILABLE_MESSAGE);
    expect(JSON.stringify(response.body)).not.toContain(
      "DigitAuth API request timed out.",
    );
  });

  it("never exposes unexpected internal errors", async () => {
    const response = await request(buildTestApp()).get("/boom");

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error.");
    expect(JSON.stringify(response.body)).not.toContain(
      "Database connection string leaked.",
    );
  });
});
