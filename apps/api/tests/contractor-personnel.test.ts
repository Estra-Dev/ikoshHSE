import request from "supertest";
import { describe, expect, it } from "vitest";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../src/models/ContractorPersonnelSiteAssignment.js";
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

async function assignSite(
  personnelId: unknown,
  contractorId: unknown,
  siteId: unknown,
  options: { isActive?: boolean } = {},
) {
  return ContractorPersonnelSiteAssignment.create({
    personnel: personnelId,
    contractor: contractorId,
    site: siteId,
    isActive: options.isActive ?? true,
    ...(options.isActive === false ? { endedAt: new Date() } : {}),
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
    const personnel = await createPersonnel(contractor._id);
    await assignSite(personnel._id, contractor._id, site._id);

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

  it("filters personnel using active assignments and the legacy site fallback", async () => {
    const project = await createProject();
    const assignedSite = await createSite(project._id);
    const otherSite = await createSite(project._id);
    const contractor = await createContractor();

    const assignedPersonnel = await createPersonnel(contractor._id);
    await assignSite(assignedPersonnel._id, contractor._id, assignedSite._id);

    const legacyPersonnel = await createPersonnel(
      contractor._id,
      assignedSite._id,
    );

    const otherPersonnel = await createPersonnel(contractor._id);
    await assignSite(otherPersonnel._id, contractor._id, otherSite._id);

    await createPersonnel(contractor._id);

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [assignedSite._id],
    });

    const response = await request(testApp)
      .get("/api/contractor-personnel")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.personnel).toHaveLength(2);
    expect(response.body.personnel.map((person: { id: string }) => person.id)).toEqual(
      expect.arrayContaining([
        String(assignedPersonnel._id),
        String(legacyPersonnel._id),
      ]),
    );

    const assigned = response.body.personnel.find(
      (person: { id: string }) => person.id === String(assignedPersonnel._id),
    );

    expect(assigned.activeSites).toEqual([
      { id: String(assignedSite._id), name: assignedSite.name },
    ]);
    expect(assigned.site).toBeNull();
  });

  it("excludes personnel whose only assignment has ended", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    const personnel = await createPersonnel(contractor._id);
    await assignSite(personnel._id, contractor._id, site._id, {
      isActive: false,
    });

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "EMPLOYEE",
      assignedSites: [site._id],
    });

    const response = await request(testApp)
      .get("/api/contractor-personnel")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.personnel).toHaveLength(0);
  });

  it("returns personnel assigned to multiple sites exactly once", async () => {
    const project = await createProject();
    const siteOne = await createSite(project._id);
    const siteTwo = await createSite(project._id);
    const contractor = await createContractor();
    const personnel = await createPersonnel(contractor._id);
    await assignSite(personnel._id, contractor._id, siteOne._id);
    await assignSite(personnel._id, contractor._id, siteTwo._id);

    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_OFFICER",
      assignedSites: [siteOne._id, siteTwo._id],
    });

    const response = await request(testApp)
      .get("/api/contractor-personnel")
      .set("Authorization", authorization);

    expect(response.status).toBe(200);
    expect(response.body.personnel).toHaveLength(1);
    expect(response.body.pagination.total).toBe(1);
    expect(
      response.body.personnel[0].activeSites.map(
        (site: { id: string }) => site.id,
      ),
    ).toEqual(expect.arrayContaining([String(siteOne._id), String(siteTwo._id)]));
  });

  it("returns 404 when a non-management user requests an unassigned site", async () => {
    const project = await createProject();
    const assignedSite = await createSite(project._id);
    const otherSite = await createSite(project._id);
    const contractor = await createContractor();
    const personnel = await createPersonnel(contractor._id);
    await assignSite(personnel._id, contractor._id, otherSite._id);

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
    expect(managerResponse.body.personnel[0].activeSites).toEqual([
      { id: String(otherSite._id), name: otherSite.name },
    ]);
  });

  it("supports pagination without widening site scope", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    const first = await createPersonnel(contractor._id);
    const second = await createPersonnel(contractor._id);
    await assignSite(first._id, contractor._id, site._id);
    await assignSite(second._id, contractor._id, site._id);

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
      });

    expect(created.status).toBe(201);
    expect(created.body.personnel).toMatchObject({
      firstName: "New",
      lastName: "Worker",
      personnelId: "BADGE-1",
      site: null,
      activeSites: [],
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

  it("rejects legacy siteId on create and update", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    const personnel = await createPersonnel(contractor._id);
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "ADMIN",
    });

    const createResponse = await request(testApp)
      .post("/api/contractor-personnel")
      .set("Authorization", authorization)
      .send({
        contractorId: String(contractor._id),
        firstName: "Legacy",
        lastName: "Writer",
        siteId: String(site._id),
      });

    expect(createResponse.status).toBe(400);
    expect(createResponse.body.message).toContain("siteId is no longer accepted");

    const updateResponse = await request(testApp)
      .patch(`/api/contractor-personnel/${personnel._id}`)
      .set("Authorization", authorization)
      .send({ siteId: String(site._id) });

    expect(updateResponse.status).toBe(400);
    expect(updateResponse.body.message).toContain("siteId is no longer accepted");

    const clearedResponse = await request(testApp)
      .patch(`/api/contractor-personnel/${personnel._id}`)
      .set("Authorization", authorization)
      .send({ siteId: null });

    expect(clearedResponse.status).toBe(400);
  });

  it("blocks changing contractor while active assignments or a legacy site exist", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    const otherContractor = await createContractor();
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "HSE_MANAGER",
    });

    const legacyPersonnel = await createPersonnel(contractor._id, site._id);

    const legacyBlocked = await request(testApp)
      .patch(`/api/contractor-personnel/${legacyPersonnel._id}`)
      .set("Authorization", authorization)
      .send({ contractorId: String(otherContractor._id) });

    expect(legacyBlocked.status).toBe(409);
    expect(legacyBlocked.body.message).toContain("site assignments");

    const assignedPersonnel = await createPersonnel(contractor._id);
    const assignment = await assignSite(
      assignedPersonnel._id,
      contractor._id,
      site._id,
    );

    const assignmentBlocked = await request(testApp)
      .patch(`/api/contractor-personnel/${assignedPersonnel._id}`)
      .set("Authorization", authorization)
      .send({ contractorId: String(otherContractor._id) });

    expect(assignmentBlocked.status).toBe(409);
    expect(assignmentBlocked.body.message).toContain("site assignments");

    const ended = await request(testApp)
      .delete(
        `/api/contractor-personnel/${assignedPersonnel._id}/assignments/${assignment._id}`,
      )
      .set("Authorization", authorization);

    expect(ended.status).toBe(200);

    const allowed = await request(testApp)
      .patch(`/api/contractor-personnel/${assignedPersonnel._id}`)
      .set("Authorization", authorization)
      .send({ contractorId: String(otherContractor._id) });

    expect(allowed.status).toBe(200);
    expect(allowed.body.personnel.contractor.id).toBe(
      String(otherContractor._id),
    );
  });

  it("preserves personnel and assignment history after an assignment ends", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor();
    const personnel = await createPersonnel(contractor._id, site._id);

    const assignedPersonnel = await createPersonnel(contractor._id);
    const assignment = await assignSite(
      assignedPersonnel._id,
      contractor._id,
      site._id,
    );

    const unassignedPersonnel = await createPersonnel(contractor._id);
    const { authorization } = await signInAsIkoshUser({
      ikoshRole: "ADMIN",
    });

    const blocked = await request(testApp)
      .delete(`/api/contractor-personnel/${personnel._id}`)
      .set("Authorization", authorization);

    expect(blocked.status).toBe(409);

    const blockedByAssignment = await request(testApp)
      .delete(`/api/contractor-personnel/${assignedPersonnel._id}`)
      .set("Authorization", authorization);

    expect(blockedByAssignment.status).toBe(409);

    const ended = await request(testApp)
      .delete(
        `/api/contractor-personnel/${assignedPersonnel._id}/assignments/${assignment._id}`,
      )
      .set("Authorization", authorization);

    expect(ended.status).toBe(200);

    const deletedAfterEnd = await request(testApp)
      .delete(`/api/contractor-personnel/${assignedPersonnel._id}`)
      .set("Authorization", authorization);

    expect(deletedAfterEnd.status).toBe(409);
    expect(deletedAfterEnd.body.message).toContain("assignment history");

    const preservedPersonnel = await ContractorPersonnel.findById(
      assignedPersonnel._id,
    );
    const preservedAssignment = await ContractorPersonnelSiteAssignment.findById(
      assignment._id,
    );

    expect(preservedPersonnel).not.toBeNull();
    expect(preservedAssignment).not.toBeNull();
    expect(preservedAssignment?.isActive).toBe(false);
    expect(preservedAssignment?.endedAt).toBeInstanceOf(Date);

    const deleted = await request(testApp)
      .delete(`/api/contractor-personnel/${unassignedPersonnel._id}`)
      .set("Authorization", authorization);

    expect(deleted.status).toBe(200);
    expect(
      await ContractorPersonnel.findById(unassignedPersonnel._id),
    ).toBeNull();
  });
});
