import request from "supertest";
import { describe, expect, it } from "vitest";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
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

async function createSite(projectId: unknown) {
  sequence += 1;

  return Site.create({
    project: projectId,
    name: `Site ${sequence}`,
    code: `SITE${sequence}`,
  });
}

async function createContractor() {
  sequence += 1;

  return Contractor.create({ name: `Contractor ${sequence}` });
}

async function createPersonnel(contractorId: unknown, siteId?: unknown) {
  sequence += 1;

  return ContractorPersonnel.create({
    contractor: contractorId,
    firstName: "Person",
    lastName: `Number ${sequence}`,
    ...(siteId ? { site: siteId } : {}),
  });
}

describe("contractor personnel API", () => {
  it("requires authentication", async () => {
    const response = await request(testApp).get("/api/contractor-personnel");

    expect(response.status).toBe(401);
  });

  it("fails closed when an employee has no assigned sites", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    await createPersonnel(contractor._id, site._id);

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [],
    });

    const response = await request(testApp)
      .get("/api/contractor-personnel")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.personnel).toHaveLength(0);
    expect(response.body.pagination.total).toBe(0);
  });

  it("filters personnel to assigned sites and hides unassigned personnel", async () => {
    const project = await createProject();
    const assignedSite = await createSite(project._id);
    const otherSite = await createSite(project._id);
    const contractor = await createContractor();
    const assignedPersonnel = await createPersonnel(
      contractor._id,
      assignedSite._id,
    );
    await createPersonnel(contractor._id, otherSite._id);
    await createPersonnel(contractor._id);

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [assignedSite._id],
    });

    const response = await request(testApp)
      .get("/api/contractor-personnel")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.personnel).toHaveLength(1);
    expect(response.body.personnel[0].id).toBe(String(assignedPersonnel._id));
  });

  it("returns 404 when a non-management user requests an unassigned site", async () => {
    const project = await createProject();
    const assignedSite = await createSite(project._id);
    const otherSite = await createSite(project._id);
    const contractor = await createContractor();
    await createPersonnel(contractor._id, otherSite._id);

    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [assignedSite._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const employeeResponse = await request(testApp)
      .get(`/api/contractor-personnel?siteId=${otherSite._id}`)
      .set("Authorization", employee.authorization);
    const managerResponse = await request(testApp)
      .get(`/api/contractor-personnel?siteId=${otherSite._id}`)
      .set("Authorization", manager.authorization);

    expect(employeeResponse.status).toBe(404);
    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.personnel).toHaveLength(1);
  });

  it("supports pagination without widening site scope", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    await createPersonnel(contractor._id, site._id);
    await createPersonnel(contractor._id, site._id);

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const response = await request(testApp)
      .get("/api/contractor-personnel?limit=1&page=2")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.personnel).toHaveLength(1);
    expect(response.body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });

  it.each(["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"])(
    "rejects personnel management for %s",
    async (ikoshRole) => {
      const project = await createProject();
      const site = await createSite(project._id);
      const contractor = await createContractor();
      const { authorization } = await signInAsIkoshUser({
        ikoshRole,
        assignedSites: [site._id],
      });

      const createResponse = await request(testApp)
        .post("/api/contractor-personnel")
        .set("Authorization", authorization)
        .send({
          contractorId: String(contractor._id),
          firstName: "Unauthorized",
          lastName: "Person",
          siteId: String(site._id),
        });
      const deleteResponse = await request(testApp)
        .delete("/api/contractor-personnel/000000000000000000000000")
        .set("Authorization", authorization);

      expect(createResponse.status).toBe(403);
      expect(deleteResponse.status).toBe(403);
    },
  );

  it("creates and updates personnel for HSE management", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const invalid = await request(testApp)
      .post("/api/contractor-personnel")
      .set("Authorization", authorization)
      .send({ contractorId: String(contractor._id) });

    expect(invalid.status).toBe(400);

    const created = await request(testApp)
      .post("/api/contractor-personnel")
      .set("Authorization", authorization)
      .send({
        contractorId: String(contractor._id),
        firstName: "New",
        lastName: "Worker",
        personnelId: "BADGE-1",
        siteId: String(site._id),
      });

    expect(created.status).toBe(201);
    expect(created.body.personnel).toMatchObject({
      firstName: "New",
      lastName: "Worker",
      personnelId: "BADGE-1",
      site: { id: String(site._id) },
    });

    const duplicate = await request(testApp)
      .post("/api/contractor-personnel")
      .set("Authorization", authorization)
      .send({
        contractorId: String(contractor._id),
        firstName: "Duplicate",
        lastName: "Badge",
        personnelId: "BADGE-1",
      });

    expect(duplicate.status).toBe(409);

    const updated = await request(testApp)
      .patch(`/api/contractor-personnel/${created.body.personnel.id}`)
      .set("Authorization", authorization)
      .send({ jobTitle: "Electrician" });

    expect(updated.status).toBe(200);
    expect(updated.body.personnel.jobTitle).toBe("Electrician");
  });

  it("blocks deletion while a site is assigned", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    const personnel = await createPersonnel(contractor._id, site._id);
    const unassignedPersonnel = await createPersonnel(contractor._id);
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "ADMIN",
    });

    const blocked = await request(testApp)
      .delete(`/api/contractor-personnel/${personnel._id}`)
      .set("Authorization", authorization);

    expect(blocked.status).toBe(409);

    const deleted = await request(testApp)
      .delete(`/api/contractor-personnel/${unassignedPersonnel._id}`)
      .set("Authorization", authorization);

    expect(deleted.status).toBe(200);
  });
});
