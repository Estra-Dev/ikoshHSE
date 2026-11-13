import request from "supertest";
import { describe, expect, it } from "vitest";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { User } from "../src/models/User.js";
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

async function createSite(projectId: unknown, status: "ACTIVE" | "COMPLETED" = "ACTIVE") {
  sequence += 1;

  return Site.create({
    project: projectId,
    name: `Site ${sequence}`,
    code: `SITE${sequence}`,
    status,
  });
}

describe("sites API", () => {
  it("requires authentication", async () => {
    const response = await request(testApp).get("/api/sites");

    expect(response.status).toBe(401);
  });

  it("requires authentication for site detail", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const response = await request(testApp).get(`/api/sites/${site._id}`);

    expect(response.status).toBe(401);
  });

  it("enforces site access isolation and lifecycle visibility on detail", async () => {
    const project = await createProject();
    const assignedSite = await createSite(project._id);
    const otherSite = await createSite(project._id);
    const completedSite = await createSite(project._id, "COMPLETED");

    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [assignedSite._id, completedSite._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const assignedResponse = await request(testApp)
      .get(`/api/sites/${assignedSite._id}`)
      .set("Authorization", employee.authorization);

    expect(assignedResponse.status).toBe(200);
    expect(assignedResponse.body.site).toMatchObject({
      id: String(assignedSite._id),
      name: assignedSite.name,
      code: assignedSite.code,
      status: "ACTIVE",
      project: { id: String(project._id), name: project.name },
    });

    const unassignedResponse = await request(testApp)
      .get(`/api/sites/${otherSite._id}`)
      .set("Authorization", employee.authorization);
    const inactiveResponse = await request(testApp)
      .get(`/api/sites/${completedSite._id}`)
      .set("Authorization", employee.authorization);
    const managerResponse = await request(testApp)
      .get(`/api/sites/${completedSite._id}`)
      .set("Authorization", manager.authorization);

    expect(unassignedResponse.status).toBe(404);
    expect(inactiveResponse.status).toBe(404);
    expect(managerResponse.status).toBe(200);
  });

  it("rejects unknown and malformed site detail ids", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const unknown = await request(testApp)
      .get("/api/sites/000000000000000000000000")
      .set("Authorization", authorization);
    const malformed = await request(testApp)
      .get("/api/sites/not-an-id")
      .set("Authorization", authorization);

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it("serializes populated project references in site lists", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const response = await request(testApp)
      .get("/api/sites")
      .set("Authorization", authorization);
    const serialized = response.body.sites.find(
      (entry: { id: string }) => entry.id === String(site._id),
    );

    expect(response.status).toBe(200);
    expect(serialized.project).toEqual({
      id: String(project._id),
      name: project.name,
    });
  });

  it("fails closed when an employee has no assigned sites", async () => {
    const project = await createProject();
    await createSite(project._id);
    await createSite(project._id);

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [],
    });

    const response = await request(testApp)
      .get("/api/sites")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.sites).toHaveLength(0);
    expect(response.body.pagination.total).toBe(0);
  });

  it("limits employees to assigned sites while HSE management sees all", async () => {
    const project = await createProject();
    const assignedSite = await createSite(project._id);
    await createSite(project._id);

    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [assignedSite._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const employeeResponse = await request(testApp)
      .get("/api/sites")
      .set("Authorization", employee.authorization);
    const managerResponse = await request(testApp)
      .get("/api/sites")
      .set("Authorization", manager.authorization);

    expect(employeeResponse.status).toBe(200);
    expect(employeeResponse.body.sites).toHaveLength(1);
    expect(employeeResponse.body.sites[0].id).toBe(String(assignedSite._id));
    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.sites).toHaveLength(2);
  });

  it("applies project filters and pagination without widening scope", async () => {
    const firstProject = await createProject();
    const secondProject = await createProject();
    const firstSite = await createSite(firstProject._id);
    await createSite(firstProject._id);
    await createSite(secondProject._id);

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [firstSite._id],
    });

    const response = await request(testApp)
      .get(`/api/sites?projectId=${firstProject._id}&limit=1&page=1`)
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.sites).toHaveLength(1);
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it("only exposes inactive sites to HSE management", async () => {
    const project = await createProject();
    const activeSite = await createSite(project._id);
    await createSite(project._id, "COMPLETED");

    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [activeSite._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const employeeResponse = await request(testApp)
      .get("/api/sites?includeInactive=true")
      .set("Authorization", employee.authorization);
    const managerResponse = await request(testApp)
      .get("/api/sites?includeInactive=true")
      .set("Authorization", manager.authorization);

    expect(employeeResponse.body.sites).toHaveLength(1);
    expect(managerResponse.body.sites).toHaveLength(2);
  });

  it.each(["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"])(
    "rejects site management for %s",
    async (ikoshRole) => {
      const project = await createProject();
      const { authorization } = await signInAsIkoshUser({ ikoshRole });

      const response = await request(testApp)
        .post("/api/sites")
        .set("Authorization", authorization)
        .send({
          projectId: String(project._id),
          name: "Unauthorized Site",
          code: "UNAUTH",
        });

      expect(response.status).toBe(403);
    },
  );

  it("creates and updates sites for HSE management", async () => {
    const project = await createProject();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const invalid = await request(testApp)
      .post("/api/sites")
      .set("Authorization", authorization)
      .send({ name: "Missing project and code" });

    expect(invalid.status).toBe(400);

    const created = await request(testApp)
      .post("/api/sites")
      .set("Authorization", authorization)
      .send({
        projectId: String(project._id),
        name: "Main Site",
        code: "MAIN",
      });

    expect(created.status).toBe(201);
    expect(created.body.site).toMatchObject({
      name: "Main Site",
      code: "MAIN",
      status: "ACTIVE",
    });

    const duplicate = await request(testApp)
      .post("/api/sites")
      .set("Authorization", authorization)
      .send({
        projectId: String(project._id),
        name: "Another Site",
        code: "MAIN",
      });

    expect(duplicate.status).toBe(409);

    const updated = await request(testApp)
      .patch(`/api/sites/${created.body.site.id}`)
      .set("Authorization", authorization)
      .send({ name: "Updated Site" });

    expect(updated.status).toBe(200);
    expect(updated.body.site.name).toBe("Updated Site");

    const cleared = await request(testApp)
      .patch(`/api/sites/${created.body.site.id}`)
      .set("Authorization", authorization)
      .send({ location: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.site.location).toBeNull();
  });

  it("blocks deletion while employees or personnel are assigned", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await Contractor.create({ name: "Site Contractor" });
    const personnel = await ContractorPersonnel.create({
      contractor: contractor._id,
      firstName: "Assigned",
      lastName: "Person",
      site: site._id,
    });
    const employee = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const blockedByEmployee = await request(testApp)
      .delete(`/api/sites/${site._id}`)
      .set("Authorization", manager.authorization);

    expect(blockedByEmployee.status).toBe(409);

    await User.updateOne(
      { _id: employee.user._id },
      { $set: { assignedSites: [] } },
    );

    const blockedByPersonnel = await request(testApp)
      .delete(`/api/sites/${site._id}`)
      .set("Authorization", manager.authorization);

    expect(blockedByPersonnel.status).toBe(409);

    await ContractorPersonnel.deleteOne({ _id: personnel._id });

    const deleted = await request(testApp)
      .delete(`/api/sites/${site._id}`)
      .set("Authorization", manager.authorization);

    expect(deleted.status).toBe(200);
  });
});
