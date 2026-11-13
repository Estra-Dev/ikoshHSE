import request from "supertest";
import { describe, expect, it } from "vitest";
import { AuditLog } from "../src/models/AuditLog.js";
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

async function createSite(
  projectId: unknown,
  status: "ACTIVE" | "COMPLETED" = "ACTIVE",
) {
  sequence += 1;

  return Site.create({
    project: projectId,
    name: `Site ${sequence}`,
    code: `SITE${sequence}`,
    status,
  });
}

async function createContractor(
  options: { projects?: unknown[]; isActive?: boolean } = {},
) {
  sequence += 1;

  return Contractor.create({
    name: `Contractor ${sequence}`,
    registrationNumber: `REG${sequence}`,
    projects: options.projects ?? [],
    isActive: options.isActive ?? true,
  });
}

async function createPersonnel(
  contractorId: unknown,
  options: { site?: unknown; isActive?: boolean } = {},
) {
  sequence += 1;

  return ContractorPersonnel.create({
    contractor: contractorId,
    firstName: "Person",
    lastName: `Number ${sequence}`,
    ...(options.site ? { site: options.site } : {}),
    isActive: options.isActive ?? true,
  });
}

function assignSite(
  authorization: string,
  personnelId: unknown,
  siteId: unknown,
) {
  return request(testApp)
    .post(`/api/contractor-personnel/${String(personnelId)}/assignments`)
    .set("Authorization", authorization)
    .send({ siteId: String(siteId) });
}

function endAssignment(
  authorization: string,
  personnelId: unknown,
  assignmentId: unknown,
) {
  return request(testApp)
    .delete(
      `/api/contractor-personnel/${String(personnelId)}/assignments/${String(assignmentId)}`,
    )
    .set("Authorization", authorization);
}

function getPersonnelDetail(authorization: string, personnelId: unknown) {
  return request(testApp)
    .get(`/api/contractor-personnel/${String(personnelId)}`)
    .set("Authorization", authorization);
}

describe("contractor personnel site assignments", () => {
  it("requires authentication for detail and assignment management", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor({ projects: [project._id] });
    const personnel = await createPersonnel(contractor._id);

    const detail = await request(testApp).get(
      `/api/contractor-personnel/${String(personnel._id)}`,
    );
    const assign = await request(testApp)
      .post(`/api/contractor-personnel/${String(personnel._id)}/assignments`)
      .send({ siteId: String(site._id) });
    const end = await request(testApp).delete(
      `/api/contractor-personnel/${String(personnel._id)}/assignments/000000000000000000000000`,
    );

    expect(detail.status).toBe(401);
    expect(assign.status).toBe(401);
    expect(end.status).toBe(401);
  });

  it.each(["EMPLOYEE", "SUPERVISOR", "HSE_OFFICER"])(
    "rejects assignment management for %s",
    async (ikoshRole) => {
      const project = await createProject();
      const site = await createSite(project._id);
      const contractor = await createContractor({ projects: [project._id] });
      const personnel = await createPersonnel(contractor._id);
      const { authorization } = await signInAsIkoshUser({ ikoshRole });

      const detail = await getPersonnelDetail(
        authorization,
        personnel._id,
      );
      const assign = await assignSite(
        authorization,
        personnel._id,
        site._id,
      );
      const end = await endAssignment(
        authorization,
        personnel._id,
        "000000000000000000000000",
      );

      expect(detail.status).toBe(403);
      expect(assign.status).toBe(403);
      expect(end.status).toBe(403);
    },
  );

  it("returns detail with active assignments and full history for management", async () => {
    const project = await createProject();
    const firstSite = await createSite(project._id);
    const secondSite = await createSite(project._id);
    const contractor = await createContractor({ projects: [project._id] });
    const personnel = await createPersonnel(contractor._id);
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const first = await assignSite(
      manager.authorization,
      personnel._id,
      firstSite._id,
    );
    const second = await assignSite(
      manager.authorization,
      personnel._id,
      secondSite._id,
    );
    const ended = await endAssignment(
      manager.authorization,
      personnel._id,
      second.body.assignment.id,
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(ended.status).toBe(200);

    const detail = await getPersonnelDetail(
      manager.authorization,
      personnel._id,
    );

    expect(detail.status).toBe(200);
    expect(detail.body.personnel.id).toBe(String(personnel._id));
    expect(detail.body.personnel.contractor.id).toBe(String(contractor._id));
    expect(detail.body.activeAssignments).toHaveLength(1);
    expect(detail.body.activeAssignments[0].id).toBe(first.body.assignment.id);
    expect(detail.body.activeAssignments[0].assignedBy.id).toBe(
      String(manager.user._id),
    );
    expect(detail.body.assignmentHistory).toHaveLength(2);

    const endedHistory = detail.body.assignmentHistory.find(
      (assignment: { id: string }) => assignment.id === ended.body.assignment.id,
    );

    expect(endedHistory).toMatchObject({
      isActive: false,
      site: { id: String(secondSite._id), name: secondSite.name },
      endedBy: {
        id: String(manager.user._id),
        firstName: manager.user.firstName,
        lastName: manager.user.lastName,
      },
    });
    expect(endedHistory.endedAt).toEqual(expect.any(String));
  });

  it("enforces eligibility and prevents duplicate active assignments", async () => {
    const project = await createProject();
    const otherProject = await createProject();
    const site = await createSite(project._id);
    const inactiveSite = await createSite(project._id, "COMPLETED");
    const unrelatedSite = await createSite(otherProject._id);

    const contractor = await createContractor({ projects: [project._id] });
    const inactiveContractor = await createContractor({
      projects: [project._id],
      isActive: false,
    });

    const personnel = await createPersonnel(contractor._id);
    const inactivePersonnel = await createPersonnel(contractor._id, {
      isActive: false,
    });
    const personnelOfInactiveContractor = await createPersonnel(
      inactiveContractor._id,
    );

    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await assignSite(
      manager.authorization,
      personnel._id,
      site._id,
    );
    const duplicate = await assignSite(
      manager.authorization,
      personnel._id,
      site._id,
    );
    const inactiveSiteResponse = await assignSite(
      manager.authorization,
      personnel._id,
      inactiveSite._id,
    );
    const unrelatedSiteResponse = await assignSite(
      manager.authorization,
      personnel._id,
      unrelatedSite._id,
    );
    const inactivePersonnelResponse = await assignSite(
      manager.authorization,
      inactivePersonnel._id,
      site._id,
    );
    const inactiveContractorResponse = await assignSite(
      manager.authorization,
      personnelOfInactiveContractor._id,
      site._id,
    );
    const missingPersonnelResponse = await assignSite(
      manager.authorization,
      "000000000000000000000000",
      site._id,
    );
    const missingSiteResponse = await assignSite(
      manager.authorization,
      personnel._id,
      "000000000000000000000000",
    );

    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(inactiveSiteResponse.status).toBe(409);
    expect(unrelatedSiteResponse.status).toBe(409);
    expect(inactivePersonnelResponse.status).toBe(409);
    expect(inactiveContractorResponse.status).toBe(409);
    expect(missingPersonnelResponse.status).toBe(404);
    expect(missingSiteResponse.status).toBe(404);
  });

  it("allows one person to be assigned to multiple sites simultaneously", async () => {
    const project = await createProject();
    const firstSite = await createSite(project._id);
    const secondSite = await createSite(project._id);
    const contractor = await createContractor({ projects: [project._id] });
    const personnel = await createPersonnel(contractor._id);
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const first = await assignSite(
      manager.authorization,
      personnel._id,
      firstSite._id,
    );
    const second = await assignSite(
      manager.authorization,
      personnel._id,
      secondSite._id,
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.assignment.id).not.toBe(second.body.assignment.id);

    const detail = await getPersonnelDetail(
      manager.authorization,
      personnel._id,
    );

    expect(detail.body.activeAssignments).toHaveLength(2);
    expect(detail.body.activeAssignments.map((assignment: { site: { id: string } }) => assignment.site.id)).toEqual(
      expect.arrayContaining([String(firstSite._id), String(secondSite._id)]),
    );
  });

  it("ends assignments without deleting history and allows a fresh assignment", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor({ projects: [project._id] });
    const personnel = await createPersonnel(contractor._id);
    const manager = await signInAsIkoshUser({ ikoshRole: "ADMIN" });

    const created = await assignSite(
      manager.authorization,
      personnel._id,
      site._id,
    );
    const ended = await endAssignment(
      manager.authorization,
      personnel._id,
      created.body.assignment.id,
    );

    expect(ended.status).toBe(200);
    expect(ended.body.assignment.isActive).toBe(false);
    expect(ended.body.assignment.endedAt).toEqual(expect.any(String));
    expect(ended.body.assignment.endedBy.id).toBe(String(manager.user._id));

    const stored = await ContractorPersonnelSiteAssignment.findById(
      created.body.assignment.id,
    ).lean();

    expect(stored).not.toBeNull();
    expect(stored?.isActive).toBe(false);
    expect(stored?.endedAt).toBeInstanceOf(Date);
    expect(String(stored?.endedBy)).toBe(String(manager.user._id));

    const again = await endAssignment(
      manager.authorization,
      personnel._id,
      created.body.assignment.id,
    );
    expect(again.status).toBe(409);

    const reassigned = await assignSite(
      manager.authorization,
      personnel._id,
      site._id,
    );

    expect(reassigned.status).toBe(201);
    expect(reassigned.body.assignment.id).not.toBe(
      created.body.assignment.id,
    );

    const detail = await getPersonnelDetail(
      manager.authorization,
      personnel._id,
    );

    expect(detail.body.activeAssignments).toHaveLength(1);
    expect(detail.body.assignmentHistory).toHaveLength(2);
  });

  it("records assignment creation and ending in the audit log", async () => {
    const project = await createProject();
    const site = await createSite(project._id);
    const contractor = await createContractor({ projects: [project._id] });
    const personnel = await createPersonnel(contractor._id);
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const created = await assignSite(
      manager.authorization,
      personnel._id,
      site._id,
    );
    await endAssignment(
      manager.authorization,
      personnel._id,
      created.body.assignment.id,
    );

    const assignedLog = await AuditLog.findOne({
      action: "contractor_personnel.site_assigned",
    }).lean();
    const endedLog = await AuditLog.findOne({
      action: "contractor_personnel.site_unassigned",
    }).lean();

    expect(assignedLog).not.toBeNull();
    expect(assignedLog).toMatchObject({
      actor: manager.user._id,
      entityType: "ContractorPersonnelSiteAssignment",
      entityId: expect.anything(),
      before: null,
      after: {
        personnel: String(personnel._id),
        contractor: String(contractor._id),
        site: String(site._id),
        assignedBy: String(manager.user._id),
        endedAt: null,
        endedBy: null,
        isActive: true,
      },
    });
    expect(assignedLog?.after).toMatchObject({
      assignedAt: expect.any(String),
    });

    expect(endedLog).not.toBeNull();
    expect(endedLog).toMatchObject({
      actor: manager.user._id,
      entityType: "ContractorPersonnelSiteAssignment",
      before: {
        isActive: true,
        endedAt: null,
      },
      after: {
        isActive: false,
        endedBy: String(manager.user._id),
      },
    });
    expect(endedLog?.after).toMatchObject({
      endedAt: expect.any(String),
    });
  });

  it("keeps the legacy single-site field and supports null assignedBy", async () => {
    const project = await createProject();
    const legacySite = await createSite(project._id);
    const assignedSite = await createSite(project._id);
    const contractor = await createContractor({ projects: [project._id] });
    const personnel = await createPersonnel(contractor._id, {
      site: legacySite._id,
    });
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });

    const legacyAssignment = await ContractorPersonnelSiteAssignment.create({
      personnel: personnel._id,
      contractor: contractor._id,
      site: assignedSite._id,
      assignedAt: new Date("2024-01-01T00:00:00.000Z"),
      assignedBy: null,
      isActive: true,
    });

    const detail = await getPersonnelDetail(
      manager.authorization,
      personnel._id,
    );

    expect(detail.status).toBe(200);
    expect(detail.body.personnel.site).toEqual({ id: String(legacySite._id) });
    expect(detail.body.activeAssignments).toHaveLength(1);
    expect(detail.body.activeAssignments[0]).toMatchObject({
      id: String(legacyAssignment._id),
      site: { id: String(assignedSite._id) },
      assignedAt: "2024-01-01T00:00:00.000Z",
      assignedBy: null,
      isActive: true,
    });
  });
});
