import request from "supertest";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { describe, expect, it } from "vitest";
import { requireAuth } from "@digit-auth/node";
import { app } from "../src/app.js";
import { digitAuth } from "../src/lib/digit-auth.js";
import { HttpError } from "../src/lib/http-error.js";
import { attachIkoshUser } from "../src/middleware/attach-ikosh-user.js";
import { requireIkoshRole } from "../src/middleware/require-ikosh-role.js";
import {
  createIkoshUser,
  makeDigitAuthUser,
  signInAs,
} from "./helpers.js";

/**
 * Minimal app exercising the new middleware chain against the real SDK
 * `requireAuth` implementation, with an error handler mirroring the
 * production one (passes HttpError status/message through).
 */
function buildTestApp(): express.Express {
  const testApp = express();

  testApp.get(
    "/protected",
    requireAuth(digitAuth),
    attachIkoshUser,
    (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        ikoshRole: req.ikoshUser?.ikoshRole,
      });
    },
  );

  testApp.get(
    "/admin-only",
    requireAuth(digitAuth),
    attachIkoshUser,
    requireIkoshRole("ADMIN"),
    (_req: Request, res: Response) => {
      res.status(200).json({ success: true });
    },
  );

  testApp.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : 500;
      res
        .status(status)
        .json({ success: false, message: (error as Error).message });
    },
  );

  return testApp;
}

describe("IKOSH access middleware", () => {
  it("rejects requests without a bearer token (401)", async () => {
    const response = await request(buildTestApp()).get("/protected");

    expect(response.status).toBe(401);
  });

  it("rejects requests with an unknown bearer token (401)", async () => {
    const response = await request(buildTestApp())
      .get("/protected")
      .set("Authorization", "Bearer unknown_token");

    expect(response.status).toBe(401);
  });

  it("fails closed when the DigitAuth identity has no IKOSH user record (403)", async () => {
    const digitAuthUser = makeDigitAuthUser("da_user_ghost");

    const response = await request(buildTestApp())
      .get("/protected")
      .set("Authorization", signInAs(digitAuthUser));

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/No IKOSH employee record/i);

    // Fail closed must not have created a record implicitly.
    const { User } = await import("../src/models/User.js");
    const record = await User.findOne({ digitAuthUserId: "da_user_ghost" });
    expect(record).toBeNull();
  });

  it("rejects inactive employees even though DigitAuth authentication succeeds (403)", async () => {
    await createIkoshUser({
      digitAuthUserId: "da_user_inactive",
      isActive: false,
    });
    const digitAuthUser = makeDigitAuthUser("da_user_inactive");

    const response = await request(buildTestApp())
      .get("/protected")
      .set("Authorization", signInAs(digitAuthUser));

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/inactive/i);
  });

  it("attaches the IKOSH employee record for active employees (200)", async () => {
    await createIkoshUser({
      digitAuthUserId: "da_user_active",
      ikoshRole: "SUPERVISOR",
    });
    const digitAuthUser = makeDigitAuthUser("da_user_active");

    const response = await request(buildTestApp())
      .get("/protected")
      .set("Authorization", signInAs(digitAuthUser));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, ikoshRole: "SUPERVISOR" });
  });

  it("enforces IKOSH role requirements from the MongoDB record", async () => {
    await createIkoshUser({
      digitAuthUserId: "da_user_employee",
      ikoshRole: "EMPLOYEE",
    });
    await createIkoshUser({
      digitAuthUserId: "da_user_admin",
      ikoshRole: "ADMIN",
    });

    const employeeResponse = await request(buildTestApp())
      .get("/admin-only")
      .set("Authorization", signInAs(makeDigitAuthUser("da_user_employee")));

    expect(employeeResponse.status).toBe(403);

    const adminResponse = await request(buildTestApp())
      .get("/admin-only")
      .set("Authorization", signInAs(makeDigitAuthUser("da_user_admin")));

    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body).toEqual({ success: true });
  });

  it("never derives IKOSH access from the DigitAuth role", async () => {
    // DigitAuth SUPER_ADMIN identity, but only a plain EMPLOYEE record in IKOSH.
    await createIkoshUser({
      digitAuthUserId: "da_user_mismatch",
      ikoshRole: "EMPLOYEE",
    });
    const digitAuthUser = makeDigitAuthUser("da_user_mismatch", {
      role: "SUPER_ADMIN",
    });

    const response = await request(buildTestApp())
      .get("/admin-only")
      .set("Authorization", signInAs(digitAuthUser));

    expect(response.status).toBe(403);
  });
});

describe("existing application behavior (regression)", () => {
  it("keeps GET /api/health public", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "ikoshHSE API is running",
    });
  });

  it("keeps GET /api/auth/me requiring authentication", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: "Authentication required.",
    });
  });

  it("keeps GET /api/auth/me responding for valid tokens", async () => {
    const digitAuthUser = makeDigitAuthUser("da_user_me", {
      firstName: "Me",
      lastName: "User",
      email: "me@digitauth.test",
    });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", signInAs(digitAuthUser));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      user: {
        id: "da_user_me",
        email: "me@digitauth.test",
        firstName: "Me",
        lastName: "User",
        role: "USER",
        status: "ACTIVE",
        emailVerified: true,
      },
    });
  });
});
