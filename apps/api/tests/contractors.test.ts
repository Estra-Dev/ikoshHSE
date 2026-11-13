import request from "supertest";
import { describe, expect, it } from "vitest";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../src/models/ContractorPersonnelSiteAssignment.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { signInAsIkoshUser } from "./helpers.js";
import { buildHseTestApp } from "./hse-test-app.js";

const testApp = buildHseTestApp();
let sequence = 0;

async function createProject() {
  sequence += 1;

  return Project.create({
    name: `Project ${sequence}`,
    code: `PRJ${sequence}`,
  });
}

async function createContractor(
  overrides: { isActive?: boolean; projects?: unknown[] } = {},
) {
  sequence += 1;

  return Contractor.create({
    name: `Contractor ${sequence}`,
    registrationNumber: `REG${sequence}`,
    isActive: overrides.isActive ?? true,
    projects: overrides.projects ?? [],
  });
}

describe("contractors API", () => {
  it("requires authentication", async () => {
    const response = await request(testApp).get("/api/contractors");

    expect(response.status).toBe(401);
  });

  it("lists active contractors with pagination for employees", async () => {
    await createContractor();
    await createContractor();
    await createContractor({ isActive: false });

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
    });

    const response = await request(testApp)
      .get("/api/contractors?limit=1&page=2")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.contractors).toHaveLength(1);
    expect(response.body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });

  it("only exposes inactive contractors to HSE management", async () => {
    await createContractor();
    await createContractor({ isActive: false });

    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const employeeResponse = await request(testApp)
      .get("/api/contractors?includeInactive=true")
      .set("Authorization", employee.authorization);
    const managerResponse = await request(testApp)
      .get("/api/contractors?includeInactive=true")
      .set("Authorization", manager.authorization);

    expect(employeeResponse.body.contractors).toHaveLength(1);
    expect(managerResponse.body.contractors).toHaveLength(2);
  });

  it.each(["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"])(
    "rejects contractor management for %s",
    async (ikoshRole) => {
      const { authorization } = await signInAsIkoshUser({ ikoshRole });

      const createResponse = await request(testApp)
        .post("/api/contractors")
        .set("Authorization", authorization)
        .send({ name: "Unauthorized Contractor" });
      const deleteResponse = await request(testApp)
        .delete("/api/contractors/000000000000000000000000")
        .set("Authorization", authorization);

      expect(createResponse.status).toBe(403);
      expect(deleteResponse.status).toBe(403);
    },
  );

  it("creates and updates contractors for HSE management", async () => {
    const project = await createProject();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const invalid = await request(testApp)
      .post("/api/contractors")
      .set("Authorization", authorization)
      .send({});

    expect(invalid.status).toBe(400);

    const created = await request(testApp)
      .post("/api/contractors")
      .set("Authorization", authorization)
      .send({
        name: "Prime Contractor",
        registrationNumber: "PRIME-1",
        projects: [String(project._id)],
      });

    expect(created.status).toBe(201);
    expect(created.body.contractor).toMatchObject({
      name: "Prime Contractor",
      registrationNumber: "PRIME-1",
      isActive: true,
    });
    expect(created.body.contractor.projects).toEqual([
      { id: String(project._id) },
    ]);

    const duplicate = await request(testApp)
      .post("/api/contractors")
      .set("Authorization", authorization)
      .send({ name: "Prime Contractor" });

    expect(duplicate.status).toBe(409);

    const updated = await request(testApp)
      .patch(`/api/contractors/${created.body.contractor.id}`)
      .set("Authorization", authorization)
      .send({ trade: "Electrical" });

    expect(updated.status).toBe(200);
    expect(updated.body.contractor.trade).toBe("Electrical");
  });

  it("blocks removing a project association while personnel are actively assigned", async () => {
    const project = await createProject();
    const retainedProject = await createProject();
    const site = await Site.create({
      project: project._id,
      name: "Guard Site",
      code: "GUARD1",
    });
    const contractor = await createContractor({
      projects: [project._id, retainedProject._id],
    });
    const personnel = await ContractorPersonnel.create({
      contractor: contractor._id,
      firstName: "Assigned",
      lastName: "Worker",
    });
    const assignment = await ContractorPersonnelSiteAssignment.create({
      personnel: personnel._id,
      contractor: contractor._id,
      site: site._id,
    });
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const blocked = await request(testApp)
      .patch(`/api/contractors/${contractor._id}`)
      .set("Authorization", authorization)
      .send({ projects: [String(retainedProject._id)] });

    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain("active site assignments");

    const unchanged = await Contractor.findById(contractor._id).lean();
    expect(unchanged?.projects.map(String)).toEqual(
      expect.arrayContaining([String(project._id), String(retainedProject._id)]),
    );

    assignment.isActive = false;
    assignment.endedAt = new Date();
    await assignment.save();

    const allowed = await request(testApp)
      .patch(`/api/contractors/${contractor._id}`)
      .set("Authorization", authorization)
      .send({ projects: [String(retainedProject._id)] });

    expect(allowed.status).toBe(200);
    expect(allowed.body.contractor.projects).toEqual([
      { id: String(retainedProject._id) },
    ]);

    const log = await AuditLog.findOne({
      action: "contractor.updated",
      entityId: contractor._id,
    }).lean();

    expect(log).not.toBeNull();
    expect(log?.before).toMatchObject({
      projects: expect.arrayContaining([String(project._id)]),
    });
    expect(log?.after).toMatchObject({ projects: [String(retainedProject._id)] });
  });

  it("blocks removing a project association while legacy personnel site references remain", async () => {
    const project = await createProject();
    const site = await Site.create({
      project: project._id,
      name: "Legacy Guard Site",
      code: "GUARD2",
    });
    const contractor = await createContractor({ projects: [project._id] });
    await ContractorPersonnel.create({
      contractor: contractor._id,
      firstName: "Legacy",
      lastName: "Worker",
      site: site._id,
    });
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "ADMIN",
    });

    const blocked = await request(testApp)
      .patch(`/api/contractors/${contractor._id}`)
      .set("Authorization", authorization)
      .send({ projects: [] });

    expect(blocked.status).toBe(409);
  });

  it("blocks deletion while projects or personnel are linked", async () => {
    const project = await createProject();
    const engaged = await createContractor({ projects: [project._id] });
    const withPersonnel = await createContractor();
    const free = await createContractor();
    const personnel = await ContractorPersonnel.create({
      contractor: withPersonnel._id,
      firstName: "Linked",
      lastName: "Person",
    });
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "ADMIN",
    });

    const blockedByProject = await request(testApp)
      .delete(`/api/contractors/${engaged._id}`)
      .set("Authorization", authorization);
    const blockedByPersonnel = await request(testApp)
      .delete(`/api/contractors/${withPersonnel._id}`)
      .set("Authorization", authorization);
    const deleted = await request(testApp)
      .delete(`/api/contractors/${free._id}`)
      .set("Authorization", authorization);

    expect(blockedByProject.status).toBe(409);
    expect(blockedByPersonnel.status).toBe(409);
    expect(deleted.status).toBe(200);

    await ContractorPersonnel.deleteOne({ _id: personnel._id });
  });
});
