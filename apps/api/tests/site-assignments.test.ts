import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Incident } from "../src/models/Incident.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { User } from "../src/models/User.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createSite(
  status: "ACTIVE" | "COMPLETED" = "ACTIVE",
) {
  sequence += 1;
  const project = await Project.create({
    name: `Project ${sequence}`,
    code: `PRJ${sequence}`,
  });

  return Site.create({
    project: project._id,
    name: `Site ${sequence}`,
    code: `SITE${sequence}`,
    status,
  });
}

function assignSites(
  authorization: string,
  employeeId: unknown,
  siteIds: readonly unknown[],
) {
  return request(app)
    .patch(`/api/employees/${String(employeeId)}/sites`)
    .set("Authorization", authorization)
    .send({ siteIds: siteIds.map((siteId) => String(siteId)) });
}

function reportIncident(authorization: string, siteId: unknown) {
  return request(app)
    .post("/api/incidents")
    .set("Authorization", authorization)
    .send({
      siteId: String(siteId),
      title: "Unsafe access",
      description: "Access ladder was not secured.",
      occurredAt: new Date("2026-02-01T08:00:00.000Z").toISOString(),
    });
}

function sortedIds(siteIds: readonly unknown[]): string[] {
  return siteIds.map((siteId) => String(siteId)).sort();
}

describe("PATCH /api/employees/:id/sites", () => {
  it("lets administrators and HSE managers assign and unassign multiple sites", async () => {
    const first = await createSite();
    const second = await createSite();

    for (const role of ["ADMIN", "HSE_MANAGER"] as const) {
      const target = await signInAsIkoshUser();
      const manager = await signInAsIkoshUser({ ikoshRole: role });

      const assigned = await assignSites(manager.authorization, target.user._id, [
        first._id,
        second._id,
      ]);

      expect(assigned.status).toBe(200);
      expect(sortedIds(assigned.body.employee.assignedSites)).toEqual(
        sortedIds([first._id, second._id]),
      );

      const partial = await assignSites(
        manager.authorization,
        target.user._id,
        [second._id],
      );

      expect(partial.status).toBe(200);
      expect(partial.body.employee.assignedSites).toEqual([String(second._id)]);

      const cleared = await assignSites(
        manager.authorization,
        target.user._id,
        [],
      );

      expect(cleared.status).toBe(200);
      expect(cleared.body.employee.assignedSites).toEqual([]);

      const refreshed = await User.findById(target.user._id);
      expect(refreshed?.assignedSites).toEqual([]);
    }
  });

  it("forbids ordinary roles from changing site assignments", async () => {
    const site = await createSite();
    const target = await signInAsIkoshUser();

    for (const role of ["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"] as const) {
      const viewer = await signInAsIkoshUser({ ikoshRole: role });

      const response = await assignSites(
        viewer.authorization,
        target.user._id,
        [site._id],
      );

      expect(response.status).toBe(403);
    }

    const refreshed = await User.findById(target.user._id);
    expect(refreshed?.assignedSites).toEqual([]);
  });

  it("rejects malformed, nonexistent and inactive site ids", async () => {
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });
    const target = await signInAsIkoshUser();
    const inactive = await createSite("COMPLETED");

    const malformed = await assignSites(admin.authorization, target.user._id, [
      "not-an-object-id",
    ]);
    const nonexistent = await assignSites(admin.authorization, target.user._id, [
      "0123456789ab0123456789ab",
    ]);
    const inactiveResponse = await assignSites(
      admin.authorization,
      target.user._id,
      [inactive._id],
    );

    expect(malformed.status).toBe(400);
    expect(nonexistent.status).toBe(400);
    expect(inactiveResponse.status).toBe(400);
    expect(inactiveResponse.body.message).toMatch(/active sites/i);

    const refreshed = await User.findById(target.user._id);
    expect(refreshed?.assignedSites).toEqual([]);
  });

  it("deduplicates repeated site ids", async () => {
    const first = await createSite();
    const second = await createSite();
    const target = await signInAsIkoshUser();
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await assignSites(admin.authorization, target.user._id, [
      first._id,
      first._id,
      second._id,
    ]);

    expect(response.status).toBe(200);
    expect(sortedIds(response.body.employee.assignedSites)).toEqual(
      sortedIds([first._id, second._id]),
    );
  });

  it("rejects privilege fields in the payload", async () => {
    const site = await createSite();
    const target = await signInAsIkoshUser();
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await request(app)
      .patch(`/api/employees/${String(target.user._id)}/sites`)
      .set("Authorization", admin.authorization)
      .send({
        siteIds: [String(site._id)],
        ikoshRole: "ADMIN",
        isActive: false,
      });

    expect(response.status).toBe(400);

    const refreshed = await User.findById(target.user._id);
    expect(refreshed?.ikoshRole).toBe("EMPLOYEE");
    expect(refreshed?.isActive).toBe(true);
    expect(refreshed?.assignedSites).toEqual([]);
  });

  it("records before and after assignments in the audit log", async () => {
    const first = await createSite();
    const second = await createSite();
    const target = await signInAsIkoshUser({ assignedSites: [first._id] });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const response = await assignSites(admin.authorization, target.user._id, [
      first._id,
      second._id,
    ]);

    expect(response.status).toBe(200);

    const audit = await AuditLog.findOne({
      action: "employee.sites_changed",
      entityId: target.user._id,
    }).lean();

    expect(String(audit?.actor)).toBe(String(admin.user._id));
    expect(audit?.before).toMatchObject({
      assignedSites: [String(first._id)],
    });
    expect(audit?.after).toMatchObject({
      assignedSites: sortedIds([first._id, second._id]),
    });
  });

  it("removes site and protected-resource access immediately on unassignment", async () => {
    const site = await createSite();
    const target = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const colleague = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const incident = await reportIncident(colleague.authorization, site._id);
    expect(incident.status).toBe(201);

    const beforeSites = await request(app)
      .get("/api/sites")
      .set("Authorization", target.authorization);
    const beforeIncidents = await request(app)
      .get("/api/incidents")
      .set("Authorization", target.authorization);

    expect(beforeSites.body.sites).toHaveLength(1);
    expect(beforeIncidents.body.incidents).toHaveLength(1);

    const unassigned = await assignSites(
      admin.authorization,
      target.user._id,
      [],
    );
    expect(unassigned.status).toBe(200);

    const afterSites = await request(app)
      .get("/api/sites")
      .set("Authorization", target.authorization);
    const afterIncidents = await request(app)
      .get("/api/incidents")
      .set("Authorization", target.authorization);
    const directRead = await request(app)
      .get(`/api/incidents/${String(incident.body.incident.id)}`)
      .set("Authorization", target.authorization);

    expect(afterSites.body.sites).toHaveLength(0);
    expect(afterIncidents.body.incidents).toHaveLength(0);
    expect(directRead.status).toBe(404);
  });

  it("unblocks incident reporting only after a site is assigned", async () => {
    const site = await createSite();
    const target = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [],
    });
    const admin = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const blocked = await reportIncident(target.authorization, site._id);
    expect(blocked.status).toBe(404);

    const assigned = await assignSites(
      admin.authorization,
      target.user._id,
      [site._id],
    );
    expect(assigned.status).toBe(200);

    const allowed = await reportIncident(target.authorization, site._id);
    expect(allowed.status).toBe(201);
    expect(allowed.body.incident.reportedBy.id).toBe(String(target.user._id));

    await assignSites(admin.authorization, target.user._id, []);

    const blockedAgain = await reportIncident(target.authorization, site._id);
    expect(blockedAgain.status).toBe(404);
  });
});

describe("HSE personnel directory access", () => {
  it("adds role, status and site assignments for HSE managers only", async () => {
    const site = await createSite();
    const assignedUser = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });
    const otherUser = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });

    const managerResponse = await request(app)
      .get(`/api/employees?siteId=${String(site._id)}`)
      .set("Authorization", manager.authorization);

    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.employees).toHaveLength(1);
    expect(managerResponse.body.employees[0]).toMatchObject({
      id: String(assignedUser.user._id),
      ikoshRole: "SUPERVISOR",
      isActive: true,
      assignedSites: [String(site._id)],
    });
    expect(managerResponse.body.employees[0]).not.toHaveProperty("employeeId");
    expect(managerResponse.body.employees[0]).not.toHaveProperty("hireDate");
    expect(managerResponse.body.employees[0]).not.toHaveProperty(
      "employmentType",
    );

    const roleFiltered = await request(app)
      .get("/api/employees?ikoshRole=EMPLOYEE")
      .set("Authorization", manager.authorization);

    expect(
      roleFiltered.body.employees.map(
        (entry: { id: string }) => entry.id,
      ),
    ).toContain(String(otherUser.user._id));

    const employeeResponse = await request(app)
      .get("/api/employees")
      .set("Authorization", employee.authorization);

    for (const entry of employeeResponse.body.employees) {
      expect(entry).not.toHaveProperty("ikoshRole");
      expect(entry).not.toHaveProperty("assignedSites");
      expect(entry).not.toHaveProperty("isActive");
    }
  });
});
