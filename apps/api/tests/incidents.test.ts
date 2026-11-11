import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Incident } from "../src/models/Incident.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createSite() {
  sequence += 1;
  const project = await Project.create({
    name: `Project ${sequence}`,
    code: `PRJ${sequence}`,
  });
  return Site.create({
    project: project._id,
    name: `Site ${sequence}`,
    code: `SITE${sequence}`,
  });
}

function reportBody(siteId: unknown, overrides: Record<string, unknown> = {}) {
  return {
    siteId: String(siteId),
    title: "Unsafe scaffolding",
    description: "Scaffold boards were missing on level 2.",
    occurredAt: new Date("2026-01-15T09:30:00.000Z").toISOString(),
    ...overrides,
  };
}

async function reportIncident(
  authorization: string,
  siteId: unknown,
  overrides: Record<string, unknown> = {},
) {
  return request(app)
    .post("/api/incidents")
    .set("Authorization", authorization)
    .send(reportBody(siteId, overrides));
}

describe("incidents API", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/incidents");

    expect(response.status).toBe(401);
  });

  it("lets employees report incidents at assigned sites", async () => {
    const site = await createSite();
    const { user, authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const response = await reportIncident(authorization, site._id);

    expect(response.status).toBe(201);
    expect(response.body.incident).toMatchObject({
      site: { id: String(site._id) },
      reportedBy: { id: String(user._id) },
      type: "INCIDENT",
      status: "REPORTED",
      category: null,
      classifiedBy: null,
    });
    expect(response.body.incident).not.toHaveProperty("__v");
  });

  it("supports near-miss reporting", async () => {
    const site = await createSite();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });

    const response = await reportIncident(authorization, site._id, {
      type: "NEAR_MISS",
      title: "Dropped tool near walkway",
    });

    expect(response.status).toBe(201);
    expect(response.body.incident.type).toBe("NEAR_MISS");
  });

  it("rejects reporting at an unassigned site", async () => {
    const assignedSite = await createSite();
    const otherSite = await createSite();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [assignedSite._id],
    });

    const response = await reportIncident(authorization, otherSite._id);

    expect(response.status).toBe(404);
    expect(await Incident.countDocuments({})).toBe(0);
  });

  it("allows HSE management to report at any site", async () => {
    const site = await createSite();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const response = await reportIncident(authorization, site._id);

    expect(response.status).toBe(201);
  });

  it("prevents reporters from setting management-controlled fields", async () => {
    const site = await createSite();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const withStatus = await reportIncident(authorization, site._id, {
      status: "CLOSED",
    });
    const withCategory = await reportIncident(authorization, site._id, {
      category: "NEAR_MISS",
    });

    expect(withStatus.status).toBe(400);
    expect(withCategory.status).toBe(400);
    expect(await Incident.countDocuments({})).toBe(0);
  });

  it("validates required report fields", async () => {
    const site = await createSite();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const response = await request(app)
      .post("/api/incidents")
      .set("Authorization", authorization)
      .send({ siteId: String(site._id), title: "Missing details" });

    expect(response.status).toBe(400);
  });

  it("scopes incident reads and lists to assigned sites", async () => {
    const siteA = await createSite();
    const siteB = await createSite();
    const employeeA = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [siteA._id],
    });
    const employeeB = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [siteB._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const incidentA = await reportIncident(employeeA.authorization, siteA._id);
    await reportIncident(employeeB.authorization, siteB._id);

    const listA = await request(app)
      .get("/api/incidents")
      .set("Authorization", employeeA.authorization);
    const listManager = await request(app)
      .get("/api/incidents")
      .set("Authorization", manager.authorization);
    const readCrossSite = await request(app)
      .get(`/api/incidents/${incidentA.body.incident.id}`)
      .set("Authorization", employeeB.authorization);

    expect(listA.status).toBe(200);
    expect(listA.body.incidents).toHaveLength(1);
    expect(listA.body.incidents[0].site.id).toBe(String(siteA._id));
    expect(listManager.body.incidents).toHaveLength(2);
    expect(readCrossSite.status).toBe(404);
  });

  it("hides incidents from employees with no assigned sites", async () => {
    const site = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const unassigned = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [],
    });

    await reportIncident(reporter.authorization, site._id);

    const response = await request(app)
      .get("/api/incidents")
      .set("Authorization", unassigned.authorization);

    expect(response.status).toBe(200);
    expect(response.body.incidents).toHaveLength(0);
    expect(response.body.pagination.total).toBe(0);
  });

  it("only allows HSE management to classify incidents", async () => {
    const site = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await reportIncident(reporter.authorization, site._id);
    const incidentId = created.body.incident.id;

    const denied = await request(app)
      .patch(`/api/incidents/${incidentId}/classification`)
      .set("Authorization", reporter.authorization)
      .send({ category: "NEAR_MISS" });

    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .patch(`/api/incidents/${incidentId}/classification`)
      .set("Authorization", manager.authorization)
      .send({ category: "NEAR_MISS" });

    expect(allowed.status).toBe(200);
    expect(allowed.body.incident).toMatchObject({
      category: "NEAR_MISS",
      classifiedBy: { id: String(manager.user._id) },
    });
    expect(allowed.body.incident.classifiedAt).toBeTypeOf("string");
  });

  it("only allows HSE management to change incident status", async () => {
    const site = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [site._id],
    });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const created = await reportIncident(reporter.authorization, site._id);
    const incidentId = created.body.incident.id;

    const denied = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", reporter.authorization)
      .send({ status: "TRIAGED" });

    expect(denied.status).toBe(403);

    const triaged = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", admin.authorization)
      .send({ status: "TRIAGED" });
    const closed = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", admin.authorization)
      .send({ status: "CLOSED" });

    expect(triaged.status).toBe(200);
    expect(triaged.body.incident.status).toBe("TRIAGED");
    expect(closed.status).toBe(200);
    expect(closed.body.incident.status).toBe("CLOSED");
    expect(closed.body.incident.statusUpdatedBy).toEqual({
      id: String(admin.user._id),
    });
  });

  it("lets reporters edit only their own untriaged report content", async () => {
    const site = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const colleague = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await reportIncident(reporter.authorization, site._id);
    const incidentId = created.body.incident.id;

    const updated = await request(app)
      .patch(`/api/incidents/${incidentId}`)
      .set("Authorization", reporter.authorization)
      .send({ title: "Updated title" });

    expect(updated.status).toBe(200);
    expect(updated.body.incident.title).toBe("Updated title");

    const forbidden = await request(app)
      .patch(`/api/incidents/${incidentId}`)
      .set("Authorization", colleague.authorization)
      .send({ title: "Hijacked" });

    expect(forbidden.status).toBe(403);

    await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "TRIAGED" });

    const locked = await request(app)
      .patch(`/api/incidents/${incidentId}`)
      .set("Authorization", reporter.authorization)
      .send({ title: "Too late" });

    expect(locked.status).toBe(409);
  });

  it("enforces forward-only incident status transitions", async () => {
    const site = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await reportIncident(reporter.authorization, site._id);
    const incidentId = created.body.incident.id;

    const skipToClosed = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "CLOSED" });
    const sameStatus = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "REPORTED" });

    expect(skipToClosed.status).toBe(409);
    expect(sameStatus.status).toBe(409);

    const triaged = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "TRIAGED" });
    const backward = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "REPORTED" });

    expect(triaged.status).toBe(200);
    expect(backward.status).toBe(409);

    const closed = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "CLOSED" });
    const reopened = await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "TRIAGED" });

    expect(closed.status).toBe(200);
    expect(reopened.status).toBe(409);
  });

  it("supports status filters and pagination without widening site scope", async () => {
    const site = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const first = await reportIncident(reporter.authorization, site._id);
    await reportIncident(reporter.authorization, site._id);
    await request(app)
      .patch(`/api/incidents/${first.body.incident.id}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "TRIAGED" });
    await request(app)
      .patch(`/api/incidents/${first.body.incident.id}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "CLOSED" });

    const filtered = await request(app)
      .get("/api/incidents?status=REPORTED&limit=1&page=1")
      .set("Authorization", reporter.authorization);

    expect(filtered.status).toBe(200);
    expect(filtered.body.incidents).toHaveLength(1);
    expect(filtered.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it("audits creation, classification and status changes", async () => {
    const site = await createSite();
    const reporter = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await reportIncident(reporter.authorization, site._id);
    const incidentId = created.body.incident.id;

    await request(app)
      .patch(`/api/incidents/${incidentId}/classification`)
      .set("Authorization", manager.authorization)
      .send({ category: "LOST_TIME_INJURY" });
    await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "TRIAGED" });
    await request(app)
      .patch(`/api/incidents/${incidentId}/status`)
      .set("Authorization", manager.authorization)
      .send({ status: "CLOSED" });

    const creation = await AuditLog.findOne({
      action: "incident.created",
    }).lean();
    const classification = await AuditLog.findOne({
      action: "incident.classified",
    }).lean();
    const statusChange = await AuditLog.findOne({
      action: "incident.status_changed",
      "after.status": "CLOSED",
    }).lean();

    expect(String(creation?.actor)).toBe(String(reporter.user._id));
    expect(String(classification?.actor)).toBe(String(manager.user._id));
    expect(String(statusChange?.actor)).toBe(String(manager.user._id));
    expect(classification?.after).toMatchObject({
      category: "LOST_TIME_INJURY",
      classifiedBy: String(manager.user._id),
    });
    expect(statusChange?.after).toMatchObject({ status: "CLOSED" });

    const serialized = JSON.stringify({
      creation: creation?.after,
      classification: classification?.after,
      statusChange: statusChange?.after,
    });
    expect(serialized).not.toContain("Scaffold boards");
    expect(creation?.after).not.toHaveProperty("description");
  });
});
