import request from "supertest";
import { describe, expect, it } from "vitest";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import {
  createIkoshUser,
  makeDigitAuthUser,
  signInAs,
  signInAsIkoshUser,
} from "./helpers.js";
import { buildHseTestApp } from "./hse-test-app.js";

const testApp = buildHseTestApp();
let sequence = 0;

async function createProject(
  overrides: { status?: "ACTIVE" | "COMPLETED" } = {},
) {
  sequence += 1;

  return Project.create({
    name: `Project ${sequence}`,
    code: `PRJ${sequence}`,
    status: overrides.status ?? "ACTIVE",
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

describe("projects API", () => {
  it("requires authentication", async () => {
    const response = await request(testApp).get("/api/projects");

    expect(response.status).toBe(401);
  });

  it("lists active projects with pagination for employees", async () => {
    await createProject();
    await createProject();
    await createProject({ status: "COMPLETED" });

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
    });

    const firstPage = await request(testApp)
      .get("/api/projects?limit=1&page=1")
      .set("Authorization", authorization);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.projects).toHaveLength(1);
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    const secondPage = await request(testApp)
      .get("/api/projects?limit=1&page=2")
      .set("Authorization", authorization);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.projects).toHaveLength(1);
    expect(secondPage.body.projects[0].id).not.toBe(
      firstPage.body.projects[0].id,
    );
  });

  it("only exposes inactive projects to HSE management", async () => {
    await createProject();
    await createProject({ status: "COMPLETED" });

    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const employeeResponse = await request(testApp)
      .get("/api/projects?includeInactive=true")
      .set("Authorization", employee.authorization);
    const managerResponse = await request(testApp)
      .get("/api/projects?includeInactive=true")
      .set("Authorization", manager.authorization);

    expect(employeeResponse.status).toBe(200);
    expect(employeeResponse.body.projects).toHaveLength(1);
    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.projects).toHaveLength(2);
  });

  it.each(["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"])(
    "rejects project creation for %s",
    async (ikoshRole) => {
      const { authorization } = await signInAsIkoshUser({ ikoshRole });

      const response = await request(testApp)
        .post("/api/projects")
        .set("Authorization", authorization)
        .send({ name: "Unauthorized Project", code: "UNAUTH" });

      expect(response.status).toBe(403);
    },
  );

  it("uses the IKOSH role, not the DigitAuth role, for authorization", async () => {
    const employee = await createIkoshUser({ ikoshRole: "EMPLOYEE" });
    const authorization = signInAs(
      makeDigitAuthUser(employee.digitAuthUserId, { role: "SUPER_ADMIN" }),
    );

    const response = await request(testApp)
      .post("/api/projects")
      .set("Authorization", authorization)
      .send({ name: "DigitAuth Admin Project", code: "DIGIAUTH" });

    expect(response.status).toBe(403);
  });

  it("requires authentication for project detail", async () => {
    const project = await createProject();
    const response = await request(testApp).get(`/api/projects/${project._id}`);

    expect(response.status).toBe(401);
  });

  it("returns active project detail and hides non-active projects from non-management", async () => {
    const activeProject = await createProject();
    const completedProject = await createProject({ status: "COMPLETED" });
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const activeResponse = await request(testApp)
      .get(`/api/projects/${activeProject._id}`)
      .set("Authorization", employee.authorization);

    expect(activeResponse.status).toBe(200);
    expect(activeResponse.body.project).toMatchObject({
      id: String(activeProject._id),
      name: activeProject.name,
      code: activeProject.code,
      status: "ACTIVE",
    });

    const hiddenResponse = await request(testApp)
      .get(`/api/projects/${completedProject._id}`)
      .set("Authorization", employee.authorization);

    expect(hiddenResponse.status).toBe(404);

    const managerResponse = await request(testApp)
      .get(`/api/projects/${completedProject._id}`)
      .set("Authorization", manager.authorization);

    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.project.status).toBe("COMPLETED");
  });

  it("rejects unknown and malformed project detail ids", async () => {
    const { authorization } = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const unknown = await request(testApp)
      .get("/api/projects/000000000000000000000000")
      .set("Authorization", authorization);
    const malformed = await request(testApp)
      .get("/api/projects/not-an-id")
      .set("Authorization", authorization);

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it("creates projects for HSE management and enforces validation", async () => {
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const invalid = await request(testApp)
      .post("/api/projects")
      .set("Authorization", authorization)
      .send({ name: "Missing code" });

    expect(invalid.status).toBe(400);

    const created = await request(testApp)
      .post("/api/projects")
      .set("Authorization", authorization)
      .send({
        name: "New Project",
        code: "NEWPRJ",
        client: "IKOSH Client",
      });

    expect(created.status).toBe(201);
    expect(created.body.project).toMatchObject({
      name: "New Project",
      code: "NEWPRJ",
      client: "IKOSH Client",
      status: "ACTIVE",
    });

    const duplicate = await request(testApp)
      .post("/api/projects")
      .set("Authorization", authorization)
      .send({ name: "New Project", code: "OTHER" });

    expect(duplicate.status).toBe(409);
  });

  it("updates projects for HSE management only", async () => {
    const project = await createProject();
    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const forbidden = await request(testApp)
      .patch(`/api/projects/${project._id}`)
      .set("Authorization", employee.authorization)
      .send({ name: "Nope" });

    expect(forbidden.status).toBe(403);

    const updated = await request(testApp)
      .patch(`/api/projects/${project._id}`)
      .set("Authorization", manager.authorization)
      .send({ name: "Updated Project" });

    expect(updated.status).toBe(200);
    expect(updated.body.project.name).toBe("Updated Project");

    const cleared = await request(testApp)
      .patch(`/api/projects/${project._id}`)
      .set("Authorization", manager.authorization)
      .send({ client: null, location: null });

    expect(cleared.status).toBe(200);
    expect(cleared.body.project.client).toBeNull();
    expect(cleared.body.project.location).toBeNull();
  });

  it("blocks deletion while sites exist and succeeds otherwise", async () => {
    const projectWithSite = await createProject();
    const site = await createSite(projectWithSite._id);
    const emptyProject = await createProject();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "ADMIN",
    });

    const blocked = await request(testApp)
      .delete(`/api/projects/${projectWithSite._id}`)
      .set("Authorization", authorization);

    expect(blocked.status).toBe(409);

    await Site.deleteOne({ _id: site._id });

    const deleted = await request(testApp)
      .delete(`/api/projects/${projectWithSite._id}`)
      .set("Authorization", authorization);
    const emptyDeleted = await request(testApp)
      .delete(`/api/projects/${emptyProject._id}`)
      .set("Authorization", authorization);

    expect(deleted.status).toBe(200);
    expect(emptyDeleted.status).toBe(200);
  });
});
