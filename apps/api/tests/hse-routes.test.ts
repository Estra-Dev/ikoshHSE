import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  INJURED_BODY_PARTS,
  PERMIT_TO_WORK_TYPES,
  PROJECT_STATUSES,
  SITE_STATUSES,
  WASTE_TYPES,
} from "../src/lib/hse-constants.js";
import { signInAsIkoshUser } from "./helpers.js";

const PROTECTED_ROUTES = [
  "/api/projects",
  "/api/sites",
  "/api/contractors",
  "/api/contractor-personnel",
  "/api/attachments",
  "/api/incidents",
  "/api/hse/reference",
];

describe("HSE route registration", () => {
  it.each(PROTECTED_ROUTES)(
    "rejects unauthenticated access to %s",
    async (path) => {
      const response = await request(app).get(path);

      expect(response.status).toBe(401);
    },
  );

  it.each(PROTECTED_ROUTES)(
    "serves %s to an authenticated employee",
    async (path) => {
      const { authorization } = await signInAsIkoshUser({
        ikoshRole: "EMPLOYEE",
      });

      const response = await request(app)
        .get(path)
        .set("Authorization", authorization);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    },
  );

  it("serves reference data at the normalized /api/hse/reference path", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const response = await request(app)
      .get("/api/hse/reference")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.incidentCategories).toEqual([
      ...INCIDENT_CATEGORIES,
    ]);
    expect(response.body.data.incidentTypes).toEqual([...INCIDENT_TYPES]);
    expect(response.body.data.incidentStatuses).toEqual([
      ...INCIDENT_STATUSES,
    ]);
    expect(response.body.data.injuredBodyParts).toEqual([
      ...INJURED_BODY_PARTS,
    ]);
    expect(response.body.data.permitToWorkTypes).toEqual([
      ...PERMIT_TO_WORK_TYPES,
    ]);
    expect(response.body.data.wasteTypes).toEqual([...WASTE_TYPES]);
    expect(response.body.data.projectStatuses).toEqual([...PROJECT_STATUSES]);
    expect(response.body.data.siteStatuses).toEqual([...SITE_STATUSES]);
  });

  it("no longer exposes the legacy /api/hse/hse-reference path", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const response = await request(app)
      .get("/api/hse/hse-reference")
      .set("Authorization", authorization);

    expect(response.status).toBe(404);
  });

  it("serves a site-scoped dashboard to non-management roles", async () => {
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const employeeResponse = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", employee.authorization);
    const managerResponse = await request(app)
      .get("/api/hse/dashboard")
      .set("Authorization", manager.authorization);

    expect(employeeResponse.status).toBe(200);
    expect(managerResponse.status).toBe(200);
    expect(employeeResponse.body.data.totals).toBeDefined();
    expect(managerResponse.body.data.totals).toBeDefined();
  });

  it("retires the obsolete attachment upload URL placeholder", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .post("/api/hse/attachments/upload/url")
      .set("Authorization", authorization)
      .send({});

    expect(response.status).toBe(404);
  });

  it("rejects malformed pagination parameters with a 400", async () => {
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
    });

    const paths = [
      "/api/projects?page=abc",
      "/api/incidents?limit=abc",
      "/api/attachments?page=0",
      "/api/contractor-personnel?limit=999",
    ];

    for (const path of paths) {
      const response = await request(app)
        .get(path)
        .set("Authorization", authorization);

      expect(response.status).toBe(400);
    }
  });

  it("does not grant CORS access to unconfigured browser origins", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("Origin", "https://malicious.example");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("still exposes health and authenticated identity routes", async () => {
    const health = await request(app).get("/api/health");
    const me = await request(app).get("/api/auth/me");

    expect(health.status).toBe(200);
    expect(me.status).toBe(401);
  });
});
